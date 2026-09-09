"""Capture post-process pipeline: merge → structure → classify → extract → synthesize → materialize."""

from __future__ import annotations

import json
from typing import Any

from rich.console import Console

from openkms_cli.core.settings import get_cli_settings
from openkms_cli.core.workflow_config import resolve_job_workflow_config
from openkms_cli.pipeline.capture_api import CapturePipelineJobApiError, get_capture_job_context, patch_capture_job
from openkms_cli.pipeline.capture_config import resolve_post_process_config, workflow_temperature
from openkms_cli.pipeline.capture_llm import resolve_capture_llm_model, workflow_llm_model_name
from openkms_cli.pipeline.capture_materialize import materialize_capture_for_index
from openkms_cli.pipeline.capture_merge import merge_segment_turns
from openkms_cli.pipeline.capture_structure import (
    build_chapters,
    build_topics,
    classify_capture,
    extract_knowledge,
    llm_build_topics,
    llm_classify_capture,
    llm_extract_knowledge,
)
from openkms_cli.pipeline.capture_summarize import synthesize_summary
from openkms_cli.pipeline.storage import get_s3_client

console = Console(stderr=True)

PROGRESS_STAGES = ["structuring", "classifying", "extracting", "synthesizing", "materializing"]


def fail_capture_job(
    api_url: str,
    job_id: str,
    message: str,
    *,
    failed_from_stage: str | None = None,
) -> None:
    console.print(f"[red]{message}[/red]")
    metrics = {"failed_from_stage": failed_from_stage} if failed_from_stage else None
    try:
        patch_capture_job(
            api_url,
            job_id,
            stage="failed",
            error_message=message[:2000],
            metrics=metrics,
        )
    except CapturePipelineJobApiError as e:
        console.print(f"[yellow]Could not mark capture job failed: {e}[/yellow]")


def _load_workflow(ctx: dict[str, Any]) -> dict[str, Any]:
    return resolve_job_workflow_config(
        pipeline_name=str(ctx.get("pipeline_name") or "audio-capture-post-process"),
        job_config_yaml=ctx.get("config_yaml"),
    )


def _read_transcript(s3_client: Any, bucket: str, key: str) -> str:
    response = s3_client.get_object(Bucket=bucket, Key=key)
    body = response["Body"].read()
    return body.decode("utf-8", errors="replace")


def _put_json(s3_client: Any, bucket: str, key: str, payload: dict[str, Any]) -> None:
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
    )


def _put_text(
    s3_client: Any,
    bucket: str,
    key: str,
    text: str,
    *,
    content_type: str = "text/markdown; charset=utf-8",
) -> None:
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=text.encode("utf-8"),
        ContentType=content_type,
    )


def _step_mode(step_cfg: dict[str, Any]) -> str:
    return str(step_cfg.get("mode") or "rules").strip().lower()


def _needs_llm(pp_cfg: dict[str, Any]) -> bool:
    for step_key in ("segment_topics", "classify", "extract"):
        step = pp_cfg.get(step_key)
        if isinstance(step, dict) and _step_mode(step) == "llm":
            return True
    synth = pp_cfg.get("synthesize_summary")
    if isinstance(synth, dict) and synth.get("enabled", True):
        mode = str(synth.get("mode") or "llm").strip().lower()
        if mode == "llm":
            return True
    return False


def _synthesize_enabled(pp_cfg: dict[str, Any]) -> bool:
    synth = pp_cfg.get("synthesize_summary")
    if not isinstance(synth, dict):
        return True
    return bool(synth.get("enabled", True))


def _required_artifact_keys(artifact_keys: dict[str, str], pp_cfg: dict[str, Any]) -> dict[str, str]:
    keys = {key: value for key, value in artifact_keys.items() if value}
    if not _synthesize_enabled(pp_cfg):
        keys.pop("summary", None)
    return keys


def _artifact_exists(s3_client: Any, bucket: str, key: str | None) -> bool:
    if not key:
        return False
    try:
        s3_client.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def _artifact_keys_present(
    s3_client: Any,
    bucket: str,
    artifact_keys: dict[str, str],
    pp_cfg: dict[str, Any],
) -> bool:
    for key in _required_artifact_keys(artifact_keys, pp_cfg).values():
        if not _artifact_exists(s3_client, bucket, key):
            return False
    return True


def _progress_index(stage: str) -> int:
    normalized = stage.strip()
    if normalized in {"", "submitted"}:
        return 0
    try:
        return PROGRESS_STAGES.index(normalized)
    except ValueError:
        return 0


def _should_skip_step(step_stage: str, resume_stage: str, artifact_key: str | None, s3_client: Any, bucket: str) -> bool:
    step_i = PROGRESS_STAGES.index(step_stage)
    resume_i = _progress_index(resume_stage)
    if step_i >= resume_i:
        return False
    return _artifact_exists(s3_client, bucket, artifact_key)


def run_capture_post_process(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")

    try:
        ctx = get_capture_job_context(api, job_id)
    except CapturePipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    artifact_keys = ctx.get("artifact_keys") or {}
    bucket = str(ctx.get("bucket") or "")
    workflow = _load_workflow(ctx)
    pp_cfg = resolve_post_process_config(workflow)
    temperature = workflow_temperature(workflow)
    current_stage = stage if stage in PROGRESS_STAGES else "structuring"

    if stage == "done":
        if bucket and artifact_keys and _artifact_keys_present(
            get_s3_client(
                cfg.aws_endpoint_url or None,
                cfg.aws_access_key_id,
                cfg.aws_secret_access_key,
                cfg.aws_region,
            ),
            bucket,
            artifact_keys,
            pp_cfg,
        ):
            console.print(f"[dim]Capture job {job_id} already done[/dim]")
            return
        console.print(
            f"[yellow]Capture job {job_id} marked done but artifacts are missing — re-running post-process[/yellow]"
        )
        patch_capture_job(api, job_id, stage="structuring")
        stage = "structuring"
        current_stage = "structuring"
    if stage == "failed":
        console.print(f"[red]Capture job {job_id} is failed — run retry from the API before re-dispatching[/red]")
        raise SystemExit(1)

    segments = ctx.get("segments") or []
    if not segments:
        fail_capture_job(api, job_id, "Capture has no segments", failed_from_stage=current_stage)
        raise SystemExit(1)

    incomplete = [s for s in segments if str(s.get("status")) != "completed"]
    if incomplete:
        fail_capture_job(api, job_id, "Not all segments are transcribed", failed_from_stage=current_stage)
        raise SystemExit(1)

    if not cfg.aws_access_key_id or not cfg.aws_secret_access_key:
        fail_capture_job(api, job_id, "AWS credentials required for S3 access", failed_from_stage=current_stage)
        raise SystemExit(1)

    bucket = str(ctx.get("bucket") or "")
    client = get_s3_client(
        cfg.aws_endpoint_url or None,
        cfg.aws_access_key_id,
        cfg.aws_secret_access_key,
        cfg.aws_region,
    )

    segment_cfg = pp_cfg.get("segment_topics") if isinstance(pp_cfg.get("segment_topics"), dict) else {}
    chapters_cfg = pp_cfg.get("chapters") if isinstance(pp_cfg.get("chapters"), dict) else {}
    classify_cfg = pp_cfg.get("classify") if isinstance(pp_cfg.get("classify"), dict) else {}
    extract_cfg = pp_cfg.get("extract") if isinstance(pp_cfg.get("extract"), dict) else {}
    synthesize_cfg = (
        pp_cfg.get("synthesize_summary") if isinstance(pp_cfg.get("synthesize_summary"), dict) else {}
    )

    llm_model = None
    if _needs_llm(pp_cfg) or workflow_llm_model_name(workflow):
        try:
            llm_model = resolve_capture_llm_model(workflow, cfg=cfg)
            if llm_model:
                console.print(
                    f"[dim]capture_llm model={llm_model.get('model_name')} "
                    f"base={str(llm_model.get('base_url') or '').rstrip('/')}[/dim]"
                )
        except RuntimeError as e:
            if _needs_llm(pp_cfg):
                fail_capture_job(api, job_id, str(e), failed_from_stage=current_stage)
                raise SystemExit(1) from e
            console.print(f"[yellow]LLM resolve skipped: {e}[/yellow]")

    def loader(key: str) -> str:
        return _read_transcript(client, bucket, key)

    resume_stage = stage if stage in PROGRESS_STAGES else "structuring"

    try:
        structured_key = str(artifact_keys.get("structured_transcript") or "")
        recording_context_key = str(artifact_keys.get("recording_context") or "")
        extraction_key = str(artifact_keys.get("extraction") or "")
        summary_key = str(artifact_keys.get("summary") or "")

        structured: dict[str, Any] | None = None
        recording_context: dict[str, Any] | None = None
        extraction: dict[str, Any] | None = None
        capture = ctx.get("capture") or {}

        if not _should_skip_step("structuring", resume_stage, structured_key, client, bucket):
            current_stage = "structuring"
            patch_capture_job(api, job_id, stage="structuring")
            turns = merge_segment_turns(segments, transcript_loader=loader)

            topics: list[dict[str, Any]] = []
            if bool(segment_cfg.get("enabled", True)):
                if _step_mode(segment_cfg) == "llm":
                    if not llm_model:
                        raise RuntimeError("segment_topics.mode=llm requires model_name")
                    topics = llm_build_topics(
                        turns=turns,
                        capture=capture,
                        segment_cfg=segment_cfg,
                        model_params=llm_model,
                        temperature=temperature,
                    )
                else:
                    topics = build_topics(
                        turns,
                        window_minutes=int(segment_cfg.get("window_minutes") or 12),
                        preview_max_chars=int(segment_cfg.get("preview_max_chars") or 160),
                    )

            chapters: list[dict[str, Any]] = []
            if bool(chapters_cfg.get("enabled", True)) and topics:
                if _step_mode(chapters_cfg) == "one_per_topic":
                    chapters = build_chapters(topics)

            structured = {
                "capture_id": ctx.get("capture_id"),
                "turn_count": len(turns),
                "turns": turns,
                "topics": topics,
                "chapters": chapters,
                "structure_modes": {
                    "segment_topics": _step_mode(segment_cfg),
                    "chapters": _step_mode(chapters_cfg),
                    "classify": _step_mode(classify_cfg),
                    "extract": _step_mode(extract_cfg),
                    "synthesize_summary": str(synthesize_cfg.get("mode") or "llm")
                    if _synthesize_enabled(pp_cfg)
                    else "disabled",
                },
            }
            if llm_model:
                structured["llm_model"] = llm_model.get("model_name")
            _put_json(client, bucket, structured_key, structured)
        elif structured_key:
            raw = client.get_object(Bucket=bucket, Key=structured_key)["Body"].read()
            structured = json.loads(raw.decode("utf-8"))

        topics = (structured or {}).get("topics") if isinstance(structured, dict) else []

        if not _should_skip_step("classifying", resume_stage, recording_context_key, client, bucket):
            current_stage = "classifying"
            patch_capture_job(api, job_id, stage="classifying")
            if not structured:
                raise RuntimeError("structured_transcript artifact missing for classify step")

            audience = str(capture.get("audience") or "unknown")
            if _step_mode(classify_cfg) == "llm":
                if not llm_model:
                    raise RuntimeError("classify.mode=llm requires model_name")
                classification = llm_classify_capture(
                    capture=capture,
                    audience=audience,
                    topics=topics or [],
                    classify_cfg=classify_cfg,
                    model_params=llm_model,
                    temperature=temperature,
                )
            else:
                classification = classify_capture(
                    recording_mode_hint=capture.get("recording_mode"),
                    audience=audience,
                    turns=structured.get("turns") or [],
                    topics=topics or [],
                    classify_cfg=classify_cfg,
                )

            recording_context = {
                "capture_id": capture.get("id"),
                "title": capture.get("title"),
                "brief": capture.get("brief"),
                "participants_hint": capture.get("participants_hint"),
                "recording_mode": classification.get("recording_mode"),
                "audience": classification.get("audience"),
                "classification": classification,
            }
            _put_json(client, bucket, recording_context_key, recording_context)
        elif recording_context_key:
            raw = client.get_object(Bucket=bucket, Key=recording_context_key)["Body"].read()
            recording_context = json.loads(raw.decode("utf-8"))

        if not _should_skip_step("extracting", resume_stage, extraction_key, client, bucket):
            current_stage = "extracting"
            patch_capture_job(api, job_id, stage="extracting")
            if not structured or not recording_context:
                raise RuntimeError("Missing artifacts for extract step")
            classification = recording_context.get("classification") or {}

            if _step_mode(extract_cfg) == "llm":
                if not llm_model:
                    raise RuntimeError("extract.mode=llm requires model_name")
                extraction = llm_extract_knowledge(
                    capture=capture,
                    classification=classification,
                    topics=topics or [],
                    turns=structured.get("turns") or [],
                    extract_cfg=extract_cfg,
                    model_params=llm_model,
                    temperature=temperature,
                )
            else:
                extraction = extract_knowledge(
                    capture=capture,
                    classification=classification,
                    topics=topics or [],
                    turns=structured.get("turns") or [],
                    extract_cfg=extract_cfg,
                )
            _put_json(client, bucket, extraction_key, extraction)
        elif extraction_key:
            raw = client.get_object(Bucket=bucket, Key=extraction_key)["Body"].read()
            extraction = json.loads(raw.decode("utf-8"))

        if _synthesize_enabled(pp_cfg):
            if not _should_skip_step("synthesizing", resume_stage, summary_key, client, bucket):
                current_stage = "synthesizing"
                patch_capture_job(api, job_id, stage="synthesizing")
                if not recording_context or not extraction:
                    raise RuntimeError("Missing artifacts for synthesize step")
                if not summary_key:
                    raise RuntimeError("artifact_keys.summary is required when synthesize_summary is enabled")
                summary_md = synthesize_summary(
                    capture=capture,
                    recording_context=recording_context,
                    extraction=extraction,
                    structured_topics=topics or [],
                    synthesize_cfg=synthesize_cfg,
                    model_params=llm_model,
                    temperature=temperature,
                )
                _put_text(client, bucket, summary_key, summary_md)

        if ctx.get("materialize_for_index"):
            materialized_key = (
                f"documents/{str(ctx.get('index_file_hash') or '').strip()}/markdown.md"
                if ctx.get("index_file_hash")
                else None
            )
            if not _should_skip_step("materializing", resume_stage, materialized_key, client, bucket):
                current_stage = "materializing"
                patch_capture_job(api, job_id, stage="materializing")
                materialize_capture_for_index(ctx=ctx, s3_client=client, bucket=bucket, api_url=api)

        patch_capture_job(api, job_id, stage="done")
        console.print(f"[green]Capture job {job_id} done — artifacts uploaded[/green]")
    except Exception as e:
        fail_capture_job(api, job_id, str(e), failed_from_stage=current_stage)
        raise SystemExit(1) from e
