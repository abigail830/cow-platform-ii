"""Async audio pipeline: submit → poll → finalize transcript artifacts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from rich.console import Console

from openkms_cli.core.settings import get_cli_settings
from openkms_cli.pipeline.audio_api import (
    AudioPipelineJobApiError,
    get_audio_job_context,
    patch_audio_job,
)
from openkms_cli.pipeline.post_ingest import parse_s3_uri
from openkms_cli.pipeline.storage import get_s3_client
from openkms_cli.providers.aliyun.asr import (
    DEFAULT_MODEL,
    AliyunAsrError,
    format_transcript_markdown,
    submit_file_transcription,
    upload_transcript_artifacts,
    wait_for_transcription,
)
from openkms_cli.providers.aliyun.docmind import presign_s3_get_url, redact_file_url

console = Console(stderr=True)


def _load_workflow(config_yaml: str | None) -> dict[str, Any]:
    if not config_yaml or not config_yaml.strip():
        return {
            "asr": {
                "model": DEFAULT_MODEL,
                "enable_diarization": True,
            }
        }
    data = yaml.safe_load(config_yaml)
    return data if isinstance(data, dict) else {}


def fail_audio_job(api_url: str, job_id: str, message: str) -> None:
    console.print(f"[red]{message}[/red]")
    try:
        patch_audio_job(api_url, job_id, stage="failed", error_message=message[:2000])
    except AudioPipelineJobApiError as e:
        console.print(f"[yellow]Could not mark audio job failed: {e}[/yellow]")


def submit_audio_job(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_audio_job_context(api, job_id)
    except AudioPipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    if stage != "submitted":
        console.print(f"[dim]Audio job {job_id} stage={stage}; skip submit[/dim]")
        return
    if (ctx.get("external_job_id") or "").strip():
        console.print(f"[dim]Audio job {job_id} already has external_job_id; skip submit[/dim]")
        return

    try:
        _submit_aliyun(ctx, api, job_id)
        audio = ctx.get("audio") or {}
        console.print(f"[green]Submitted audio job {job_id} audio={audio.get('id')}[/green]")
    except Exception as e:
        fail_audio_job(api, job_id, str(e))
        raise SystemExit(1) from e


def _submit_aliyun(ctx: dict[str, Any], api_url: str, job_id: str) -> None:
    cfg = get_cli_settings()
    if not cfg.aws_access_key_id or not cfg.aws_secret_access_key:
        raise AliyunAsrError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required for OSS presign")
    if not cfg.dashscope_api_key:
        raise AliyunAsrError("DASHSCOPE_API_KEY is required")

    workflow = _load_workflow(ctx.get("config_yaml"))
    asr_cfg = workflow.get("asr") if isinstance(workflow.get("asr"), dict) else {}
    model = str(asr_cfg.get("model") or DEFAULT_MODEL)
    enable_diarization = bool(asr_cfg.get("enable_diarization", True))
    context_prompt = asr_cfg.get("context_prompt")

    audio = ctx["audio"]
    bucket, key = parse_s3_uri(ctx["input_uri"])
    file_name = Path(audio.get("name") or key).name or Path(key).name

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

    task_id = submit_file_transcription(
        file_url=file_url,
        api_key=cfg.dashscope_api_key,
        base_url=cfg.dashscope_base_url,
        model=model,
        enable_diarization=enable_diarization,
        context_prompt=str(context_prompt) if context_prompt else None,
    )
    patch_audio_job(api_url, job_id, stage="transcribing", external_job_id=task_id)


def poll_audio_job(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_audio_job_context(api, job_id)
    except AudioPipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    if stage in {"done", "failed"}:
        console.print(f"[dim]Audio job {job_id} stage={stage}; skip poll[/dim]")
        return

    external_id = (ctx.get("external_job_id") or "").strip()
    if not external_id:
        console.print(f"[dim]Audio job {job_id} has no external_job_id yet[/dim]")
        return

    if stage == "submitted":
        patch_audio_job(api, job_id, stage="transcribing")

    try:
        data = wait_for_transcription(
            task_id=external_id,
            api_key=cfg.dashscope_api_key,
            base_url=cfg.dashscope_base_url,
            poll_interval_seconds=cfg.async_poll_interval_seconds,
            max_wait_seconds=max(cfg.async_max_wait_seconds, 7200),
        )
    except AliyunAsrError as e:
        fail_audio_job(api, job_id, str(e))
        raise SystemExit(1) from e

    finalize_audio_job(job_id, api, ctx, data)


def finalize_audio_job(
    job_id: str,
    api_url: str,
    ctx: dict[str, Any] | None = None,
    asr_result: dict[str, Any] | None = None,
) -> None:
    cfg = get_cli_settings()
    api = api_url.rstrip("/")
    if ctx is None:
        ctx = get_audio_job_context(api, job_id)

    if asr_result is None:
        external_id = (ctx.get("external_job_id") or "").strip()
        if not external_id:
            fail_audio_job(api, job_id, "Missing external_job_id for finalize")
            raise SystemExit(1)
        from openkms_cli.providers.aliyun.asr import query_transcription_task

        asr_result = query_transcription_task(
            task_id=external_id,
            api_key=cfg.dashscope_api_key,
            base_url=cfg.dashscope_base_url,
        )

    workflow = _load_workflow(ctx.get("config_yaml"))
    asr_cfg = workflow.get("asr") if isinstance(workflow.get("asr"), dict) else {}
    model = str(asr_cfg.get("model") or DEFAULT_MODEL)

    audio = ctx["audio"]
    file_name = str(audio.get("name") or "audio")
    transcript_md = format_transcript_markdown(filename=file_name, asr_result=asr_result, model=model)

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
        asr_result=asr_result,
    )

    patch_audio_job(api, job_id, stage="done")
    console.print(f"[green]Audio job {job_id} done — transcript uploaded[/green]")


def run_async_audio_job(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_audio_job_context(api, job_id)
    except AudioPipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    if stage == "done":
        console.print(f"[dim]Audio job {job_id} already done[/dim]")
        return
    if stage == "failed":
        console.print(f"[red]Audio job {job_id} is failed[/red]")
        raise SystemExit(1)

    if stage == "submitted" and not (ctx.get("external_job_id") or "").strip():
        submit_audio_job(job_id, api)
        ctx = get_audio_job_context(api, job_id)

    if stage in {"submitted", "transcribing"}:
        poll_audio_job(job_id, api)
