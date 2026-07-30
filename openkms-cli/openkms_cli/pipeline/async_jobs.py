"""Async pipeline job stages: submit, poll, finalize, extract-metadata."""

from __future__ import annotations

import hashlib
import json
import re
import shlex
import tempfile
import time
from pathlib import Path
from typing import Any

from rich.console import Console

from openkms_cli.core.settings import get_cli_settings
from openkms_cli.pipeline.api_client import (
    post_pipeline_version,
    put_document_markdown,
    resolve_api_request_auth,
    run_pipeline_metadata_extraction,
)
from openkms_cli.pipeline.jobs import (
    PipelineJobApiError,
    get_job_context,
    patch_job,
    post_provider_ready,
)
from openkms_cli.pipeline.storage import content_type_for_path, get_s3_client

console = Console(stderr=True)


def _parse_s3_uri(uri: str) -> tuple[str, str]:
    m = re.match(r"^s3://([^/]+)/(.+)$", uri.strip())
    if not m:
        raise ValueError(f"Invalid S3 URI: {uri}")
    return m.group(1), m.group(2).rstrip("/")


def _fail_job(api_url: str, job_id: str, message: str) -> None:
    console.print(f"[red]{message}[/red]")
    try:
        patch_job(api_url, job_id, stage="failed", error_message=message[:2000])
    except PipelineJobApiError as e:
        console.print(f"[yellow]Could not mark job failed: {e}[/yellow]")


def _download_input_to_temp(ctx: dict[str, Any], work_dir: Path) -> tuple[Path, bytes, str]:
    cfg = get_cli_settings()
    bucket, key = _parse_s3_uri(ctx["input_uri"])
    client = get_s3_client(
        cfg.aws_endpoint_url or None,
        cfg.aws_access_key_id,
        cfg.aws_secret_access_key,
        cfg.aws_region,
    )
    content = client.get_object(Bucket=bucket, Key=key)["Body"].read()
    ext = Path(key).suffix.lower().lstrip(".") or "bin"
    stored = work_dir / f"input.{ext}"
    stored.write_bytes(content)
    return stored, content, ext


def _upload_hash_dir(
    hash_dir: Path,
    *,
    bucket: str,
    prefix: str,
    endpoint_url: str | None,
    access_key: str,
    secret_key: str,
    region: str,
) -> int:
    client = get_s3_client(endpoint_url, access_key, secret_key, region)
    count = 0
    for f in hash_dir.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(hash_dir).as_posix()
        client.put_object(
            Bucket=bucket,
            Key=f"{prefix}/{rel}",
            Body=f.read_bytes(),
            ContentType=content_type_for_path(rel),
        )
        count += 1
    return count


def _build_page_index(
    hash_dir: Path,
    *,
    provider: str | None = None,
    layouts: list[dict[str, Any]] | None = None,
    page_index_strategy: str | None = None,
    doc_name: str | None = None,
) -> None:
    try:
        from openkms_cli.page_index.strategy import effective_page_index_strategy, write_page_index

        strategy = effective_page_index_strategy(
            provider=provider,
            override=page_index_strategy,
        )
        tree = write_page_index(
            strategy=strategy,
            hash_dir=hash_dir,
            layouts=layouts,
            doc_name=doc_name or hash_dir.name,
        )
        if tree is None:
            console.print("[dim]Skipped page index: no markdown.md[/dim]")
        else:
            console.print(f"[dim]PageIndex built (strategy={strategy})[/dim]")
    except Exception as e:
        console.print(f"[yellow]PageIndex build failed: {e}[/yellow]")


def _sync_markdown_and_version(api_url: str, document_id: str, markdown: str) -> bool:
    auth_headers, basic, has_auth = resolve_api_request_auth(required=True)
    if not has_auth:
        return False
    ok, auth_headers, basic = put_document_markdown(
        api_url, document_id, markdown, auth_headers, basic
    )
    if ok:
        post_pipeline_version(api_url, document_id, auth_headers, basic)
    return ok


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

    work = Path(tempfile.mkdtemp(prefix="openkms-pipeline-"))
    try:
        if provider == "baidu":
            _submit_baidu(ctx, api, job_id, work)
        elif provider == "aliyun":
            _submit_aliyun(ctx, api, job_id)
        else:
            _fail_job(api, job_id, f"Unsupported provider for submit: {provider}")
            raise SystemExit(1)
        console.print(f"[green]Submitted job {job_id} ({provider}) document={document_id}[/green]")
    except Exception as e:
        _fail_job(api, job_id, str(e))
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

    stored, _content, ext = _download_input_to_temp(ctx, work)
    parse_path, hash_src = prepare_for_baidu_parse(stored, work / "baidu_stage")
    file_bytes = parse_path.read_bytes()
    file_hash = hashlib.sha256((hash_src if hash_src != parse_path else parse_path).read_bytes()).hexdigest()
    file_name = parse_path.name

    import requests

    session = requests.Session()
    bos_key, _ = stage_file_on_bos(file_bytes, file_hash, ext, file_name)
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
    bucket, key = _parse_s3_uri(ctx["input_uri"])
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
        _fail_job(api, job_id, detail or "Provider reported failure")
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
            _fail_job(api, job_id, detail or "Provider reported failure")
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

    _fail_job(api, job_id, f"Timed out waiting for cloud parse after {max_wait}s")
    raise SystemExit(1)


def run_async_job(
    job_id: str,
    api_url: str | None = None,
    page_index_strategy: str | None = None,
    poll_interval: int | None = None,
    max_wait: int | None = None,
) -> None:
    """
    Platform async orchestration in one CLI process: submit → poll cloud → finalize worker.

    Backend only spawns this command and receives PATCH stage updates — no backend poll loop.
    """
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    interval = poll_interval if poll_interval is not None else cfg.async_poll_interval_seconds
    wait_cap = max_wait if max_wait is not None else cfg.async_max_wait_seconds

    try:
        ctx = get_job_context(api, job_id)
    except PipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = str(ctx.get("stage") or "")
    if stage in {"done", "failed"}:
        console.print(f"[dim]Job {job_id} already terminal ({stage})[/dim]")
        return

    if stage != "submitted":
        console.print(f"[dim]Job {job_id} stage={stage}; run finalize only[/dim]")
        finalize_job(job_id, api_url, page_index_strategy=page_index_strategy)
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
    finalize_job(job_id, api_url, page_index_strategy=page_index_strategy)


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
        AliyunDocmindError,
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
) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_job_context(api, job_id)
    except PipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    stage = ctx.get("stage")
    if stage in {"done", "failed"}:
        console.print(f"[dim]Job {job_id} already terminal ({stage})[/dim]")
        return

    external_id = (ctx.get("external_job_id") or "").strip()
    if not external_id:
        _fail_job(api, job_id, "Missing external_job_id for finalize")
        raise SystemExit(1)

    provider = ctx.get("provider")
    doc = ctx["document"]
    prefix = ctx["s3_prefix"]
    document_id = doc["id"]

    work = Path(tempfile.mkdtemp(prefix="openkms-finalize-"))
    out_base = work / "parsed"
    out_base.mkdir(parents=True, exist_ok=True)
    provider_layouts: list[dict[str, Any]] | None = None

    try:
        from openkms_cli.page_index.strategy import effective_page_index_strategy

        resolved_strategy = effective_page_index_strategy(
            provider=provider,
            override=page_index_strategy,
        )

        if provider == "baidu":
            result, hash_dir = _finalize_baidu(ctx, external_id, out_base, work)
            raw_layouts = result.get("baidu_layouts")
            if isinstance(raw_layouts, list):
                provider_layouts = [item for item in raw_layouts if isinstance(item, dict)]
        elif provider == "aliyun":
            result, hash_dir = _finalize_aliyun(
                ctx,
                external_id,
                out_base,
                page_index_strategy=resolved_strategy,
            )
            raw_layouts = result.get("aliyun_layouts")
            if isinstance(raw_layouts, list):
                provider_layouts = [item for item in raw_layouts if isinstance(item, dict)]
        else:
            _fail_job(api, job_id, f"Unsupported provider: {provider}")
            raise SystemExit(1)

        _build_page_index(
            hash_dir,
            provider=provider,
            layouts=provider_layouts,
            page_index_strategy=resolved_strategy,
            doc_name=doc.get("name"),
        )
        count = _upload_hash_dir(
            hash_dir,
            bucket=cfg.aws_bucket_name,
            prefix=prefix,
            endpoint_url=cfg.aws_endpoint_url or None,
            access_key=cfg.aws_access_key_id,
            secret_key=cfg.aws_secret_access_key,
            region=cfg.aws_region,
        )
        console.print(f"[green]Uploaded {count} files to s3://{cfg.aws_bucket_name}/{prefix}/[/green]")

        markdown = (result.get("markdown") or "").strip()
        if markdown:
            _sync_markdown_and_version(api, document_id, markdown)

        patch_job(api, job_id, stage="parsed")

        extraction_args = (ctx.get("extraction_args") or "").strip()
        if extraction_args:
            _run_metadata_extraction_from_ctx(ctx, api, job_id)
        else:
            patch_job(api, job_id, stage="done")
            console.print(f"[green]Job {job_id} done[/green]")
    except Exception as e:
        _fail_job(api, job_id, str(e))
        raise SystemExit(1) from e


def _run_metadata_extraction_from_ctx(ctx: dict[str, Any], api: str, job_id: str) -> None:
    extraction_args = (ctx.get("extraction_args") or "").strip()
    if not extraction_args:
        patch_job(api, job_id, stage="done")
        return

    cfg = get_cli_settings()
    args = shlex.split(extraction_args)
    document_id = ctx["document"]["id"]
    prefix = ctx["s3_prefix"]

    from rich.progress import Progress, SpinnerColumn, TextColumn

    hash_dir = Path(tempfile.mkdtemp(prefix="openkms-meta-"))
    bucket, _ = _parse_s3_uri(ctx["input_uri"])

    client = get_s3_client(
        cfg.aws_endpoint_url or None,
        cfg.aws_access_key_id,
        cfg.aws_secret_access_key,
        cfg.aws_region,
    )
    raw = client.get_object(Bucket=bucket, Key=f"{prefix}/result.json")["Body"].read()
    result = json.loads(raw)
    (hash_dir / "result.json").write_bytes(raw)
    if result.get("markdown"):
        (hash_dir / "markdown.md").write_text(result["markdown"], encoding="utf-8")

    def _flag_value(flag: str) -> str | None:
        if flag not in args:
            return None
        idx = args.index(flag)
        if idx + 1 >= len(args):
            return None
        return args[idx + 1]

    auth_headers, basic_auth, has_auth = resolve_api_request_auth(required=True)
    if not has_auth:
        raise RuntimeError("API authentication required for metadata extraction")

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task("Extracting metadata...", total=None)
        auth_headers, basic_auth = run_pipeline_metadata_extraction(
            result=result,
            hash_dir=hash_dir,
            prefix=prefix,
            extract_metadata="--extract-metadata" in args,
            document_id=document_id,
            extraction_schema=_flag_value("--extraction-schema"),
            extraction_model_name=_flag_value("--extraction-model-name"),
            extraction_model_base_url=_flag_value("--extraction-model-base-url"),
            extraction_api_key=_flag_value("--extraction-api-key"),
            api_url=api,
            skip_upload=False,
            bucket=cfg.aws_bucket_name,
            endpoint_url=cfg.aws_endpoint_url or None,
            access_key=cfg.aws_access_key_id,
            secret_key=cfg.aws_secret_access_key,
            region=cfg.aws_region,
            progress=progress,
            task=task,
            auth_headers=auth_headers,
            basic_auth=basic_auth,
        )

    patch_job(api, job_id, stage="extracted_metadata")
    patch_job(api, job_id, stage="done")
    console.print(f"[green]Job {job_id} metadata done[/green]")


def _finalize_baidu(
    ctx: dict[str, Any],
    task_id: str,
    out_base: Path,
    work: Path,
) -> tuple[dict[str, Any], Path]:
    from openkms_cli.providers.baidu.parser import BaiduParseError, finalize_baidu_task

    stored, _content, ext = _download_input_to_temp(ctx, work)
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

    result = build_result_from_layouts(
        layouts,
        file_hash=ctx["document"]["file_hash"],
        status_data=status_data,
        markdown_override=markdown,
    )
    result["aliyun_layouts"] = layouts
    if not (result.get("markdown") or "").strip():
        raise AliyunDocmindError(
            f"Aliyun parse produced no markdown (layouts={len(layouts)}, task_id={task_id})"
        )
    hash_dir = out_base / result["file_hash"]
    hash_dir.mkdir(parents=True, exist_ok=True)
    (hash_dir / "result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    if result.get("markdown"):
        (hash_dir / "markdown.md").write_text(result["markdown"], encoding="utf-8")
    return result, hash_dir


def extract_metadata_job(job_id: str, api_url: str | None = None) -> None:
    cfg = get_cli_settings()
    api = (api_url or cfg.openkms_api_url).rstrip("/")
    try:
        ctx = get_job_context(api, job_id)
    except PipelineJobApiError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1) from e

    try:
        _run_metadata_extraction_from_ctx(ctx, api, job_id)
    except Exception as e:
        _fail_job(api, job_id, str(e))
        raise SystemExit(1) from e
