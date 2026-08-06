"""Async pipeline job stages: submit, poll, finalize, extract-metadata."""

from __future__ import annotations

import hashlib
import json
import tempfile
import time
from pathlib import Path
from typing import Any

from rich.console import Console

from openkms_cli.core.settings import get_cli_settings
from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.ingest.registry import is_native_ingest, resolve_ingest_kind
from openkms_cli.pipeline.jobs import (
    PipelineJobApiError,
    get_job_context,
    patch_job,
    post_provider_ready,
)
from openkms_cli.pipeline.post_ingest import (
    complete_job_after_parse,
    download_input_to_temp,
    fail_job,
    finalize_job_artifacts,
    parse_s3_uri,
    run_metadata_extraction_from_ctx,
)

console = Console(stderr=True)


def submit_job(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_job_context(api, job_id)
    except PipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    if stage != "submitted":
        console.print(f"[dim]Job {job_id} stage={stage}; skip submit[/dim]")
        return
    if (ctx.get("external_job_id") or "").strip():
        console.print(f"[dim]Job {job_id} already has external_job_id; skip submit[/dim]")
        return

    provider = ctx.get("provider")
    doc = ctx.get("document") or {}
    document_id = doc.get("id") or ctx.get("document_id")

    if provider == "paddle":
        fail_job(
            api,
            job_id,
            "paddleocr-doc-parse uses sync VLM parse in pipeline run-async (no cloud submit step)",
        )
        raise SystemExit(1)

    work = Path(tempfile.mkdtemp(prefix="openkms-pipeline-"))
    try:
        if provider == "baidu":
            _submit_baidu(ctx, api, job_id, work)
        elif provider == "aliyun":
            _submit_aliyun(ctx, api, job_id)
        else:
            fail_job(api, job_id, f"Unsupported provider for submit: {provider}")
            raise SystemExit(1)
        console.print(f"[green]Submitted job {job_id} ({provider}) document={document_id}[/green]")
    except Exception as e:
        fail_job(api, job_id, str(e))
        raise SystemExit(1) from e


def _submit_baidu(ctx: dict[str, Any], api_url: str, job_id: str, work: Path) -> None:
    from openkms_cli.providers.baidu.parser import (
        BaiduParseError,
        _submit_parse_task_file_url_with_retries,
        get_access_token,
        prepare_for_baidu_parse,
    )
    from openkms_cli.providers.baidu.bos import cleanup_bos_object, make_presign_refresher, stage_file_on_bos

    cfg = get_cli_settings()
    if not cfg.baidu_cloud_api_key or not cfg.baidu_cloud_secret_key:
        raise BaiduParseError(
            "Baidu cloud credentials not configured "
            "(OPENKMS_BAIDU_CLOUD_API_KEY / OPENKMS_BAIDU_CLOUD_SECRET_KEY). "
            "Set them in openkms-cli/.env."
        )

    stored, _content, ext = download_input_to_temp(ctx, work)
    parse_path, hash_src = prepare_for_baidu_parse(stored, work / "baidu_stage")
    file_bytes = parse_path.read_bytes()
    file_hash = hashlib.sha256(hash_src.read_bytes()).hexdigest()
    file_name = parse_path.name
    upload_ext = parse_path.suffix.lower().lstrip(".") or ext

    import requests

    session = requests.Session()
    bos_key, _ = stage_file_on_bos(file_bytes, file_hash, upload_ext, file_name)
    try:
        token = get_access_token(cfg.baidu_cloud_api_key, cfg.baidu_cloud_secret_key, session=session)
        get_file_url = make_presign_refresher(bos_key)
        task_id = _submit_parse_task_file_url_with_retries(
            token,
            file_name,
            get_file_url=get_file_url,
            file_size=len(file_bytes),
            session=session,
        )
    finally:
        cleanup_bos_object(bos_key)

    patch_job(api_url, job_id, external_job_id=task_id)


def _submit_aliyun(ctx: dict[str, Any], api_url: str, job_id: str) -> None:
    from openkms_cli.providers.aliyun.docmind import AliyunDocmindError, presign_s3_get_url, redact_file_url, submit_doc_parser_job

    cfg = get_cli_settings()
    if not cfg.aws_access_key_id or not cfg.aws_secret_access_key:
        raise AliyunDocmindError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required for OSS presign")
    if not cfg.docmind_endpoint:
        raise AliyunDocmindError("OPENKMS_DOCMIND_ENDPOINT is required")

    doc = ctx["document"]
    bucket, key = parse_s3_uri(ctx["input_uri"])
    file_name = Path(doc.get("name") or key).name or Path(key).name
    presign_ttl = cfg.oss_presign_ttl_seconds

    file_url = presign_s3_get_url(
        bucket=bucket,
        key=key,
        endpoint_url=cfg.aws_endpoint_url or None,
        access_key=cfg.aws_access_key_id,
        secret_key=cfg.aws_secret_access_key,
        region=cfg.aws_region,
        expires_in=presign_ttl,
    )
    console.print(f"[dim]aliyun_file_url={redact_file_url(file_url)} ttl={presign_ttl}s[/dim]")

    task_id = submit_doc_parser_job(
        file_url=file_url,
        file_name=file_name,
        access_key_id=cfg.aws_access_key_id,
        secret_access_key=cfg.aws_secret_access_key,
        endpoint=cfg.docmind_endpoint,
        enable_event_callback=cfg.docmind_enable_event_callback,
    )
    patch_job(api_url, job_id, external_job_id=task_id)


def poll_job(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_job_context(api, job_id)
    except PipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    if ctx.get("stage") != "submitted":
        console.print(f"[dim]Job {job_id} stage={ctx.get('stage')}; skip poll[/dim]")
        return

    external_id = (ctx.get("external_job_id") or "").strip()
    if not external_id:
        console.print(f"[yellow]Job {job_id} has no external_job_id yet[/yellow]")
        return

    provider = ctx.get("provider")
    if provider == "paddle":
        console.print(f"[dim]Job {job_id} provider=paddle; skip poll (sync VLM)[/dim]")
        return
    try:
        if provider == "baidu":
            ready, failed, detail = _poll_baidu(external_id)
        elif provider == "aliyun":
            ready, failed, detail = _poll_aliyun(external_id)
        else:
            console.print(f"[yellow]Unknown provider {provider}[/yellow]")
            return
    except Exception as e:
        console.print(f"[yellow]Poll error for {job_id}: {e}[/yellow]")
        return

    if failed:
        fail_job(api, job_id, detail or "Provider reported failure")
        raise SystemExit(1)
    if ready:
        console.print(
            f"[green]Provider ready for job {job_id}[/green] "
            "[dim](use pipeline run-async to finalize without backend round-trip)[/dim]"
        )
        post_provider_ready(api, job_id, external_job_id=external_id, provider=provider)


def _poll_until_provider_ready(
    api: str,
    job_id: str,
    ctx: dict[str, Any],
    *,
    poll_interval: int,
    max_wait: int,
) -> None:
    external_id = (ctx.get("external_job_id") or "").strip()
    if not external_id:
        raise RuntimeError("Missing external_job_id before poll loop")

    provider = ctx.get("provider")
    deadline = time.monotonic() + max_wait
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        try:
            if provider == "baidu":
                ready, failed, detail = _poll_baidu(external_id)
            elif provider == "aliyun":
                ready, failed, detail = _poll_aliyun(external_id)
            else:
                raise RuntimeError(f"Unknown provider {provider}")
        except Exception as e:
            console.print(f"[yellow]Poll attempt {attempt} error: {e}[/yellow]")
            ready, failed, detail = False, False, None

        if failed:
            fail_job(api, job_id, detail or "Provider reported failure")
            raise SystemExit(1)
        if ready:
            console.print(f"[green]Cloud parse ready for job {job_id} (attempt {attempt})[/green]")
            return

        remaining = int(deadline - time.monotonic())
        console.print(
            f"[dim]Cloud parse pending (attempt {attempt}); "
            f"sleep {poll_interval}s (max {max_wait}s, ~{remaining}s left)[/dim]"
        )
        time.sleep(poll_interval)

    fail_job(api, job_id, f"Timed out waiting for cloud parse after {max_wait}s")
    raise SystemExit(1)


def run_async_job(
    job_id: str,
    api_url: str | None = None,
    page_index_strategy: str | None = None,
    poll_interval: int | None = None,
    max_wait: int | None = None,
) -> None:
    """
    Platform async orchestration in one CLI process.

    Native ingest (markdown): local materialize → page index → upload → metadata.

    Cloud (baidu/aliyun): submit → poll → finalize (+ metadata).

    Backend only spawns this command and receives PATCH stage updates — no backend poll loop.
    """
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")

    try:
        ctx = get_job_context(api, job_id)
    except PipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    from openkms_cli.core.workflow_config import resolve_job_workflow_config

    workflow_config = resolve_job_workflow_config(
        pipeline_name=str(ctx.get("pipeline_name") or ""),
        job_config_yaml=ctx.get("config_yaml"),
    )
    interval, wait_cap = _resolve_poll_settings(workflow_config, poll_interval, max_wait)

    stage = str(ctx.get("stage") or "")
    if stage in {"done", "failed"}:
        console.print(f"[dim]Job {job_id} already terminal ({stage})[/dim]")
        return

    ingest_kind = resolve_ingest_kind(ctx=ctx)
    if is_native_ingest(ingest_kind):
        from openkms_cli.pipeline.native_job import run_native_ingest_async_job

        resolved_page_index = _resolve_page_index_strategy(
            workflow_config,
            provider=None,
            ingest_kind=ingest_kind,
            cli_override=page_index_strategy,
        )
        run_native_ingest_async_job(
            job_id,
            api,
            ctx,
            page_index_strategy=resolved_page_index,
        )
        return

    if stage == "parsed":
        from openkms_cli.core.workflow_config import metadata_extract_enabled

        if metadata_extract_enabled(workflow_config):
            run_metadata_extraction_from_ctx(ctx, api, job_id, workflow_config=workflow_config)
        else:
            patch_job(api, job_id, stage="done")
            console.print(f"[green]Job {job_id} done[/green]")
        return

    if stage == "extracted_metadata":
        patch_job(api, job_id, stage="done")
        console.print(f"[green]Job {job_id} done[/green]")
        return

    provider = str(ctx.get("provider") or "")
    if provider == "paddle":
        if stage == "submitted":
            resolved_page_index = _resolve_page_index_strategy(
                workflow_config,
                provider="paddle",
                cli_override=page_index_strategy,
            )
            from openkms_cli.providers.paddle.job import run_paddle_vlm_sync_job

            run_paddle_vlm_sync_job(
                api,
                job_id,
                ctx,
                workflow_config=workflow_config,
                page_index_strategy=resolved_page_index,
            )
        else:
            console.print(f"[dim]Job {job_id} provider=paddle stage={stage}; nothing to do[/dim]")
        return

    if stage != "submitted":
        console.print(f"[dim]Job {job_id} stage={stage}; run finalize only[/dim]")
        resolved_page_index = _resolve_page_index_strategy(
            workflow_config,
            provider=str(ctx.get("provider") or "") or None,
            cli_override=page_index_strategy,
        )
        finalize_job(job_id, api_url, page_index_strategy=resolved_page_index, workflow_config=workflow_config)
        return

    external_id = (ctx.get("external_job_id") or "").strip()
    if not external_id:
        submit_job(job_id, api_url)
        ctx = get_job_context(api, job_id)

    _poll_until_provider_ready(
        api,
        job_id,
        ctx,
        poll_interval=interval,
        max_wait=wait_cap,
    )
    resolved_page_index = _resolve_page_index_strategy(
        workflow_config,
        provider=str(ctx.get("provider") or "") or None,
        cli_override=page_index_strategy,
    )
    finalize_job(
        job_id,
        api_url,
        page_index_strategy=resolved_page_index,
        workflow_config=workflow_config,
    )


def _resolve_poll_settings(
    workflow_config: dict[str, Any],
    poll_interval: int | None,
    max_wait: int | None,
) -> tuple[int, int]:
    from openkms_cli.core.workflow_config import resolve_async_poll_settings

    cfg = get_cli_settings()
    return resolve_async_poll_settings(
        workflow_config,
        cli_poll_interval=poll_interval,
        cli_max_wait=max_wait,
        settings_poll_default=cfg.async_poll_interval_seconds,
        settings_max_wait_default=cfg.async_max_wait_seconds,
    )


def _resolve_page_index_strategy(
    workflow_config: dict[str, Any],
    *,
    provider: str | None,
    ingest_kind: Any | None = None,
    cli_override: str | None,
) -> str | None:
    from openkms_cli.core.workflow_config import resolve_page_index_strategy

    return resolve_page_index_strategy(
        workflow_config,
        provider=provider,
        ingest_kind=ingest_kind,
        cli_override=cli_override,
    )


def _poll_baidu(task_id: str) -> tuple[bool, bool, str | None]:
    from openkms_cli.providers.baidu.parser import BaiduParseError, get_access_token, query_parse_task

    cfg = get_cli_settings()
    token = get_access_token(cfg.baidu_cloud_api_key, cfg.baidu_cloud_secret_key)
    result = query_parse_task(token, task_id)
    status = str(result.get("status", "")).lower()
    if status == "success":
        return True, False, None
    if status == "failed":
        return False, True, str(result.get("task_error") or "Baidu task failed")
    return False, False, None


def _poll_aliyun(task_id: str) -> tuple[bool, bool, str | None]:
    from openkms_cli.providers.aliyun.docmind import (
        is_status_failed,
        is_status_success,
        query_doc_parser_status,
    )

    cfg = get_cli_settings()
    data = query_doc_parser_status(
        task_id,
        access_key_id=cfg.aws_access_key_id,
        secret_access_key=cfg.aws_secret_access_key,
        endpoint=cfg.docmind_endpoint,
    )
    if is_status_success(data):
        return True, False, None
    if is_status_failed(data):
        return False, True, str(data.get("Message") or data.get("message") or "Aliyun task failed")
    return False, False, None


def finalize_job(
    job_id: str,
    api_url: str | None = None,
    page_index_strategy: str | None = None,
    workflow_config: dict[str, Any] | None = None,
) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_job_context(api, job_id)
    except PipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    if workflow_config is None:
        from openkms_cli.core.workflow_config import resolve_job_workflow_config

        workflow_config = resolve_job_workflow_config(
            pipeline_name=str(ctx.get("pipeline_name") or ""),
            job_config_yaml=ctx.get("config_yaml"),
        )

    stage = ctx.get("stage")
    if stage in {"done", "failed"}:
        console.print(f"[dim]Job {job_id} already terminal ({stage})[/dim]")
        return

    external_id = (ctx.get("external_job_id") or "").strip()
    if not external_id:
        fail_job(api, job_id, "Missing external_job_id for finalize")
        raise SystemExit(1)

    provider = ctx.get("provider")

    work = Path(tempfile.mkdtemp(prefix="openkms-finalize-"))
    out_base = work / "parsed"
    out_base.mkdir(parents=True, exist_ok=True)
    _stored, original_content, _ext = download_input_to_temp(ctx, work)

    try:
        resolved_strategy = _resolve_page_index_strategy(
            workflow_config,
            provider=str(provider or "") or None,
            cli_override=page_index_strategy,
        )

        if provider == "baidu":
            result, hash_dir = _finalize_baidu(ctx, external_id, out_base, work)
        elif provider == "aliyun":
            result, hash_dir = _finalize_aliyun(
                ctx,
                external_id,
                out_base,
                page_index_strategy=resolved_strategy,
            )
        else:
            fail_job(api, job_id, f"Unsupported provider: {provider}")
            raise SystemExit(1)

        finalize_job_artifacts(
            api=api,
            job_id=job_id,
            ctx=ctx,
            result=result,
            hash_dir=hash_dir,
            ingest_kind=IngestKind.CLOUD_OCR,
            page_index_strategy=resolved_strategy,
            provider=provider,
            original_content=original_content,
        )
    except Exception as e:
        fail_job(api, job_id, str(e))
        raise SystemExit(1) from e


def _finalize_baidu(
    ctx: dict[str, Any],
    task_id: str,
    out_base: Path,
    work: Path,
) -> tuple[dict[str, Any], Path]:
    from openkms_cli.providers.baidu.parser import finalize_baidu_task

    stored, _content, ext = download_input_to_temp(ctx, work)
    return finalize_baidu_task(
        task_id=task_id,
        input_path=stored,
        output_dir=out_base,
        original_file_ext=ext,
        file_hash=ctx["document"]["file_hash"],
    )


def _finalize_aliyun(
    ctx: dict[str, Any],
    task_id: str,
    out_base: Path,
    *,
    page_index_strategy: str,
) -> tuple[dict[str, Any], Path]:
    from openkms_cli.providers.aliyun.docmind import (
        AliyunDocmindError,
        build_result_from_layouts,
        fetch_all_layouts,
        layouts_to_markdown,
        markdown_from_status,
        query_doc_parser_status,
    )
    from openkms_cli.page_index.aliyun_layout import build_markdown_with_layout_anchors
    from openkms_cli.page_index.strategy import ALIYUN_STRATEGY

    cfg = get_cli_settings()
    status_data = query_doc_parser_status(
        task_id,
        access_key_id=cfg.aws_access_key_id,
        secret_access_key=cfg.aws_secret_access_key,
        endpoint=cfg.docmind_endpoint,
    )
    layouts = fetch_all_layouts(
        task_id,
        access_key_id=cfg.aws_access_key_id,
        secret_access_key=cfg.aws_secret_access_key,
        endpoint=cfg.docmind_endpoint,
    )
    markdown_override = markdown_from_status(status_data)

    if page_index_strategy == ALIYUN_STRATEGY:
        markdown, _anchor_lines = build_markdown_with_layout_anchors(layouts)
        if not markdown.strip() and markdown_override:
            markdown = markdown_override.strip()
    else:
        markdown = (markdown_override or "").strip() or layouts_to_markdown(layouts)

    file_hash = ctx["document"]["file_hash"]
    hash_dir = out_base / file_hash
    hash_dir.mkdir(parents=True, exist_ok=True)

    from openkms_cli.parse.markdown_images import materialize_remote_markdown_images

    # DocMind embeds short-lived OSS image URLs; persist them into the document bundle.
    markdown = materialize_remote_markdown_images(
        markdown,
        file_hash=file_hash,
        out_dir=hash_dir,
    )

    result = build_result_from_layouts(
        layouts,
        file_hash=file_hash,
        status_data=status_data,
        markdown_override=markdown,
    )
    result["aliyun_layouts"] = layouts
    if not (result.get("markdown") or "").strip():
        raise AliyunDocmindError(
            f"Aliyun parse produced no markdown (layouts={len(layouts)}, task_id={task_id})"
        )
    (hash_dir / "result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    if result.get("markdown"):
        (hash_dir / "markdown.md").write_text(result["markdown"], encoding="utf-8")
    return result, hash_dir


def extract_metadata_job(job_id: str, api_url: str | None = None) -> None:
    """Run metadata extraction for a parsed document job (standalone metadata-extract pipeline)."""
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_job_context(api, job_id)
    except PipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    if stage not in {"parsed", "extracted_metadata"}:
        fail_job(
            api,
            job_id,
            f"Metadata extract requires stage=parsed (document already parsed), got {stage!r}",
        )
        raise SystemExit(1)

    from openkms_cli.core.workflow_config import (
        metadata_extract_enabled,
        resolve_job_workflow_config,
    )

    workflow_config = resolve_job_workflow_config(
        pipeline_name=str(ctx.get("pipeline_name") or ""),
        job_config_yaml=ctx.get("config_yaml"),
    )
    if not metadata_extract_enabled(workflow_config):
        fail_job(api, job_id, "Metadata extraction is disabled in workflow config")
        raise SystemExit(1)

    try:
        run_metadata_extraction_from_ctx(ctx, api, job_id, workflow_config=workflow_config)
    except Exception as e:
        fail_job(api, job_id, str(e))
        raise SystemExit(1) from e
