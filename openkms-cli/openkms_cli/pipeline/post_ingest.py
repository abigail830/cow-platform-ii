"""Shared post-ingest steps: page index, storage upload, API sync, metadata."""

from __future__ import annotations

import json
import re
import shlex
import tempfile
from pathlib import Path
from typing import Any

from rich.console import Console

from openkms_cli.core.settings import get_cli_settings
from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.ingest.registry import is_native_ingest
from openkms_cli.pipeline.api_client import (
    post_pipeline_version,
    put_document_markdown,
    resolve_api_request_auth,
    run_pipeline_metadata_extraction,
)
from openkms_cli.pipeline.jobs import patch_job
from openkms_cli.pipeline.storage import content_type_for_path, get_s3_client

console = Console(stderr=True)


def parse_s3_uri(uri: str) -> tuple[str, str]:
    m = re.match(r"^s3://([^/]+)/(.+)$", uri.strip())
    if not m:
        raise ValueError(f"Invalid S3 URI: {uri}")
    return m.group(1), m.group(2).rstrip("/")


def fail_job(api_url: str, job_id: str, message: str) -> None:
    from openkms_cli.pipeline.jobs import PipelineJobApiError

    console.print(f"[red]{message}[/red]")
    try:
        patch_job(api_url, job_id, stage="failed", error_message=message[:2000])
    except PipelineJobApiError as e:
        console.print(f"[yellow]Could not mark job failed: {e}[/yellow]")


def download_input_to_temp(ctx: dict[str, Any], work_dir: Path) -> tuple[Path, bytes, str]:
    cfg = get_cli_settings()
    bucket, key = parse_s3_uri(ctx["input_uri"])
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


def original_basename_from_ctx(ctx: dict[str, Any]) -> str:
    """S3 object basename for the uploaded source file (e.g. original.pdf)."""
    input_uri = str(ctx.get("input_uri") or "").strip()
    if not input_uri:
        doc = ctx.get("document") or {}
        s3_key = str(doc.get("s3_key") or "").strip()
        if s3_key:
            return Path(s3_key.replace("\\", "/")).name
        raise ValueError("Job context missing input_uri / document.s3_key for original artifact")
    _, key = parse_s3_uri(input_uri)
    return Path(key).name


def original_basename_from_path(stored_path: Path) -> str:
    ext = stored_path.suffix.lower().lstrip(".") or "bin"
    return f"original.{ext}"


def ensure_original_upload_artifact(
    hash_dir: Path,
    *,
    basename: str,
    content: bytes,
) -> Path:
    """Always persist the user-uploaded bytes under the canonical original.* name."""
    if not content:
        raise ValueError(f"Refusing to write empty original upload ({basename})")
    if not basename.startswith("original."):
        raise ValueError(f"Original upload artifact must be named original.<ext>, got {basename!r}")
    dest = hash_dir / basename
    dest.write_bytes(content)
    return dest


def upload_hash_dir(
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


def layouts_from_result(result: dict[str, Any]) -> list[dict[str, Any]] | None:
    for key in ("baidu_layouts", "aliyun_layouts"):
        raw = result.get(key)
        if isinstance(raw, list):
            return [item for item in raw if isinstance(item, dict)]
    return None


def build_page_index(
    hash_dir: Path,
    *,
    ingest_kind: IngestKind,
    provider: str | None = None,
    layouts: list[dict[str, Any]] | None = None,
    page_index_strategy: str | None = None,
    doc_name: str | None = None,
) -> str:
    from openkms_cli.page_index.strategy import (
        effective_page_index_strategy,
        page_index_strategy_for_native_ingest,
        write_page_index,
    )

    try:
        if is_native_ingest(ingest_kind):
            strategy = page_index_strategy_for_native_ingest(
                page_index_strategy,
                ingest_kind=ingest_kind,
            )
            if page_index_strategy and strategy != (page_index_strategy or "").strip().lower():
                console.print(
                    f"[dim]Native ingest: using {strategy} for page index "
                    f"(layout strategy {page_index_strategy!r} needs cloud parse layouts)[/dim]"
                )
        else:
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
        return strategy
    except Exception as e:
        console.print(f"[yellow]PageIndex build failed: {e}[/yellow]")
        return page_index_strategy or ""


def sync_markdown_and_version(api_url: str, document_id: str, markdown: str) -> bool:
    auth_headers, basic, has_auth = resolve_api_request_auth(required=True)
    if not has_auth:
        return False
    ok, auth_headers, basic = put_document_markdown(
        api_url, document_id, markdown, auth_headers, basic
    )
    if ok:
        post_pipeline_version(api_url, document_id, auth_headers, basic)
    return ok


def write_hash_dir_artifacts(
    *,
    hash_dir: Path,
    result: dict[str, Any],
    original_content: bytes,
    original_basename: str | None = None,
    original_ext: str | None = None,
) -> None:
    if original_basename:
        name = original_basename
    else:
        ext = (original_ext or "bin").lstrip(".") or "bin"
        name = f"original.{ext}"
    ensure_original_upload_artifact(hash_dir, basename=name, content=original_content)
    (hash_dir / "result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    markdown = result.get("markdown")
    if markdown:
        (hash_dir / "markdown.md").write_text(markdown, encoding="utf-8")


def complete_job_after_parse(api: str, job_id: str, ctx: dict[str, Any]) -> None:
    from openkms_cli.core.workflow_config import metadata_extract_enabled, resolve_job_workflow_config

    config = resolve_job_workflow_config(
        pipeline_name=str(ctx.get("pipeline_name") or ""),
        job_config_yaml=ctx.get("config_yaml"),
    )
    if metadata_extract_enabled(config):
        run_metadata_extraction_from_ctx(ctx, api, job_id, workflow_config=config)
    else:
        patch_job(api, job_id, stage="done")
        console.print(f"[green]Job {job_id} done[/green]")


def finalize_job_artifacts(
    *,
    api: str,
    job_id: str,
    ctx: dict[str, Any],
    result: dict[str, Any],
    hash_dir: Path,
    ingest_kind: IngestKind,
    page_index_strategy: str | None = None,
    provider: str | None = None,
    original_content: bytes | None = None,
) -> None:
    """Upload artifacts, sync markdown, advance job stage."""
    cfg = get_cli_settings()
    doc = ctx["document"]
    prefix = ctx["s3_prefix"]
    document_id = doc["id"]

    if original_content is None:
        work = Path(tempfile.mkdtemp(prefix="openkms-original-"))
        _stored, original_content, _ext = download_input_to_temp(ctx, work)

    ensure_original_upload_artifact(
        hash_dir,
        basename=original_basename_from_ctx(ctx),
        content=original_content,
    )

    build_page_index(
        hash_dir,
        ingest_kind=ingest_kind,
        provider=provider,
        layouts=layouts_from_result(result),
        page_index_strategy=page_index_strategy,
        doc_name=doc.get("name"),
    )
    count = upload_hash_dir(
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
        sync_markdown_and_version(api, document_id, markdown)

    patch_job(api, job_id, stage="parsed")
    complete_job_after_parse(api, job_id, ctx)


def run_metadata_extraction_from_ctx(
    ctx: dict[str, Any],
    api: str,
    job_id: str,
    *,
    workflow_config: dict[str, Any] | None = None,
) -> None:
    from openkms_cli.core.model_resolve import ModelResolveError, model_connection, resolve_models_for_job
    from openkms_cli.core.workflow_config import (
        metadata_extract_enabled,
        metadata_extract_section,
        resolve_job_workflow_config,
    )

    config = workflow_config or resolve_job_workflow_config(
        pipeline_name=str(ctx.get("pipeline_name") or ""),
        job_config_yaml=ctx.get("config_yaml"),
    )
    if not metadata_extract_enabled(config):
        patch_job(api, job_id, stage="done")
        return

    meta = metadata_extract_section(config) or {}
    try:
        resolved = resolve_models_for_job(config, api_type="chat-completions")
    except ModelResolveError as e:
        raise RuntimeError(str(e)) from e

    model_name = str(meta.get("model_name") or "").strip()
    params = resolved.get(model_name)
    if not params:
        raise RuntimeError(f"No resolved credentials for model_name={model_name!r}")

    cfg = get_cli_settings()
    document_id = ctx["document"]["id"]
    prefix = ctx["s3_prefix"]

    from rich.progress import Progress, SpinnerColumn, TextColumn

    hash_dir = Path(tempfile.mkdtemp(prefix="openkms-meta-"))
    bucket, _ = parse_s3_uri(ctx["input_uri"])

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

    auth_headers, basic_auth, has_auth = resolve_api_request_auth(required=True)
    if not has_auth:
        raise RuntimeError("API authentication required for metadata extraction")

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task("Extracting metadata...", total=None)
        auth_headers, basic_auth = run_pipeline_metadata_extraction(
            result=result,
            hash_dir=hash_dir,
            prefix=prefix,
            extract_metadata=True,
            document_id=document_id,
            metadata_extract=meta,
            model_connection=model_connection(params),
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
