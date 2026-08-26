"""Evaluation pipeline async job routing."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from rich.console import Console

from openkms_cli.core.settings import get_cli_settings
from openkms_cli.core.workflow_config import resolve_job_workflow_config
from openkms_cli.pipeline.post_ingest import parse_s3_uri
from openkms_cli.pipeline.storage import get_s3_client
from openkms_cli.providers.aliyun.asr import (
    AliyunAsrError,
    format_transcript_markdown,
    query_transcription_task,
    resolve_asr_transcription_payload,
    submit_file_transcription,
    upload_transcript_artifacts,
    wait_for_transcription,
)
from openkms_cli.providers.aliyun.asr_config import resolve_asr_from_workflow
from openkms_cli.providers.aliyun.docmind import presign_s3_get_url, redact_file_url

from evaluate_cli.pipeline.api import (
    EvalPipelineJobApiError,
    get_eval_job_context,
    patch_eval_job,
)

console = Console(stderr=True)


def fail_eval_job(api_url: str, job_id: str, message: str, metrics: dict[str, Any] | None = None) -> None:
    console.print(f"[red]{message}[/red]")
    try:
        patch_eval_job(
            api_url,
            job_id,
            stage="failed",
            error_message=message[:2000],
            metrics=metrics,
        )
    except EvalPipelineJobApiError as e:
        console.print(f"[yellow]Could not mark eval job failed: {e}[/yellow]")


def _load_workflow(ctx: dict[str, Any]) -> dict[str, Any]:
    return resolve_job_workflow_config(
        pipeline_name=str(ctx.get("pipeline_name") or "aliyun-qwen-audio-transcribe"),
        job_config_yaml=ctx.get("config_yaml"),
    )


def _asr_options(workflow: dict[str, Any]) -> dict[str, Any]:
    asr_cfg = workflow.get("asr") if isinstance(workflow.get("asr"), dict) else {}
    enable_diarization = bool(asr_cfg.get("enable_diarization", False))
    context_prompt = asr_cfg.get("context_prompt")
    prompt = str(context_prompt).strip() if context_prompt else None

    language_hints: list[str] | None = None
    raw_hints = asr_cfg.get("language_hints")
    if isinstance(raw_hints, list):
        language_hints = [str(h).strip() for h in raw_hints if str(h).strip()]

    speaker_count: int | None = None
    raw_speaker_count = asr_cfg.get("speaker_count")
    if raw_speaker_count is not None:
        try:
            speaker_count = int(raw_speaker_count)
        except (TypeError, ValueError):
            speaker_count = None

    return {
        "enable_diarization": enable_diarization,
        "context_prompt": prompt or None,
        "language_hints": language_hints,
        "speaker_count": speaker_count,
    }


def _dataset_item_name(ctx: dict[str, Any]) -> str:
    dataset_item = ctx.get("dataset_item") or {}
    return str(dataset_item.get("name") or "audio")


def _elapsed_ms(started: float) -> int:
    return max(0, int((time.monotonic() - started) * 1000))


def submit_eval_job(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_eval_job_context(api, job_id)
    except EvalPipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    if stage != "submitted":
        console.print(f"[dim]Eval job {job_id} stage={stage}; skip submit[/dim]")
        return
    if (ctx.get("external_job_id") or "").strip():
        console.print(f"[dim]Eval job {job_id} already has external_job_id; skip submit[/dim]")
        return

    try:
        _submit_aliyun(ctx, api, job_id)
        console.print(f"[green]Submitted eval job {job_id} item={_dataset_item_name(ctx)}[/green]")
    except Exception as e:
        fail_eval_job(api, job_id, str(e))
        raise SystemExit(1) from e


def _submit_aliyun(ctx: dict[str, Any], api_url: str, job_id: str) -> None:
    cfg = get_cli_settings()
    if not cfg.aws_access_key_id or not cfg.aws_secret_access_key:
        raise AliyunAsrError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required for OSS presign")

    workflow = _load_workflow(ctx)
    asr_runtime = resolve_asr_from_workflow(workflow, cfg=cfg)
    asr_options = _asr_options(workflow)

    dataset_item = ctx["dataset_item"]
    bucket, key = parse_s3_uri(ctx["input_uri"])
    file_name = Path(dataset_item.get("name") or key).name or Path(key).name

    file_url = presign_s3_get_url(
        bucket=bucket,
        key=key,
        endpoint_url=cfg.aws_endpoint_url or None,
        access_key=cfg.aws_access_key_id,
        secret_key=cfg.aws_secret_access_key,
        region=cfg.aws_region,
        expires_in=cfg.oss_presign_ttl_seconds,
    )
    console.print(f"[dim]asr_file_url={redact_file_url(file_url)} ttl={cfg.oss_presign_ttl_seconds}s[/dim]")
    console.print(
        f"[dim]asr_model={asr_runtime.model} config={asr_runtime.display_name} "
        f"base={asr_runtime.base_url.rstrip('/')}[/dim]"
    )

    task_id = submit_file_transcription(
        file_url=file_url,
        api_key=asr_runtime.api_key,
        base_url=asr_runtime.base_url,
        model=asr_runtime.model,
        enable_diarization=asr_options["enable_diarization"],
        context_prompt=asr_options["context_prompt"],
        language_hints=asr_options["language_hints"],
        speaker_count=asr_options["speaker_count"],
        vocabulary_id=None,
    )
    patch_eval_job(api_url, job_id, stage="transcribing", external_job_id=task_id)


def poll_eval_job(job_id: str, api_url: str | None = None, metrics: dict[str, Any] | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_eval_job_context(api, job_id)
    except EvalPipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    if stage in {"done", "failed"}:
        console.print(f"[dim]Eval job {job_id} stage={stage}; skip poll[/dim]")
        return

    external_id = (ctx.get("external_job_id") or "").strip()
    if not external_id:
        console.print(f"[dim]Eval job {job_id} has no external_job_id yet[/dim]")
        return

    if stage == "submitted":
        patch_eval_job(api, job_id, stage="transcribing")

    workflow = _load_workflow(ctx)
    asr_runtime = resolve_asr_from_workflow(workflow, cfg=cfg)

    try:
        data = wait_for_transcription(
            task_id=external_id,
            api_key=asr_runtime.api_key,
            base_url=asr_runtime.base_url,
            poll_interval_seconds=cfg.async_poll_interval_seconds,
            max_wait_seconds=max(cfg.async_max_wait_seconds, 7200),
        )
    except AliyunAsrError as e:
        fail_eval_job(api, job_id, str(e), metrics=metrics)
        raise SystemExit(1) from e

    finalize_eval_job(job_id, api, ctx, data, metrics=metrics)


def finalize_eval_job(
    job_id: str,
    api_url: str,
    ctx: dict[str, Any] | None = None,
    asr_result: dict[str, Any] | None = None,
    metrics: dict[str, Any] | None = None,
) -> None:
    cfg = get_cli_settings()
    api = api_url.rstrip("/")
    if ctx is None:
        ctx = get_eval_job_context(api, job_id)

    workflow = _load_workflow(ctx)
    asr_runtime = resolve_asr_from_workflow(workflow, cfg=cfg)

    finalize_started = time.monotonic()
    if asr_result is None:
        external_id = (ctx.get("external_job_id") or "").strip()
        if not external_id:
            fail_eval_job(api, job_id, "Missing external_job_id for finalize", metrics=metrics)
            raise SystemExit(1)
        asr_result = query_transcription_task(
            task_id=external_id,
            api_key=asr_runtime.api_key,
            base_url=asr_runtime.base_url,
        )

    file_name = _dataset_item_name(ctx)
    transcription_payload = resolve_asr_transcription_payload(asr_result)
    transcript_md = format_transcript_markdown(
        filename=file_name,
        asr_result=transcription_payload,
        model=asr_runtime.model,
    )

    bucket, _ = parse_s3_uri(ctx["input_uri"])
    s3_prefix = str(ctx.get("s3_prefix") or "")
    client = get_s3_client(
        cfg.aws_endpoint_url or None,
        cfg.aws_access_key_id,
        cfg.aws_secret_access_key,
        cfg.aws_region,
    )
    upload_transcript_artifacts(
        s3_client=client,
        bucket=bucket,
        s3_prefix=s3_prefix,
        transcript_md=transcript_md,
        asr_result=transcription_payload,
    )

    payload_metrics = dict(metrics or {})
    payload_metrics["finalize_duration_ms"] = _elapsed_ms(finalize_started)
    patch_eval_job(api, job_id, stage="done", metrics=payload_metrics)
    console.print(f"[green]Eval job {job_id} done — transcript uploaded[/green]")


def run_async_eval_job(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    worker_started = time.monotonic()
    metrics: dict[str, Any] = {
        "dataset_item_id": None,
        "pipeline_name": None,
    }

    try:
        ctx = get_eval_job_context(api, job_id)
    except EvalPipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    metrics["dataset_item_id"] = ctx.get("dataset_item_id")
    metrics["pipeline_name"] = ctx.get("pipeline_name")

    stage = str(ctx.get("stage") or "")
    if stage == "done":
        console.print(f"[dim]Eval job {job_id} already done[/dim]")
        return
    if stage == "failed":
        console.print(f"[red]Eval job {job_id} is failed[/red]")
        raise SystemExit(1)

    if stage == "submitted" and not (ctx.get("external_job_id") or "").strip():
        submit_started = time.monotonic()
        submit_eval_job(job_id, api)
        metrics["submit_duration_ms"] = _elapsed_ms(submit_started)
        ctx = get_eval_job_context(api, job_id)
        stage = str(ctx.get("stage") or "")

    if stage in {"submitted", "transcribing"}:
        asr_started = time.monotonic()
        poll_eval_job(job_id, api, metrics=metrics)
        metrics["asr_duration_ms"] = _elapsed_ms(asr_started)

    metrics["worker_duration_ms"] = _elapsed_ms(worker_started)
    if stage in {"submitted", "transcribing", "done"}:
        patch_eval_job(api, job_id, metrics=metrics)
