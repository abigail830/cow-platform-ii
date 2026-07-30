"""Async job path for markdown ingest (all pipeline providers)."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from rich.console import Console

from openkms_cli.core.settings import get_cli_settings
from openkms_cli.parse.markdown_ingest import is_markdown_job_context, materialize_markdown_ingest
from openkms_cli.pipeline.jobs import patch_job

console = Console(stderr=True)


def _fail_job(api: str, job_id: str, message: str) -> None:
    from openkms_cli.pipeline.async_jobs import _fail_job as fail_job

    fail_job(api, job_id, message)


def run_markdown_ingest_async_job(
    job_id: str,
    api: str,
    ctx: dict[str, Any],
    *,
    page_index_strategy: str | None = None,
) -> None:
    """Ingest .md without cloud/VLM parse; then metadata extraction if configured."""
    from openkms_cli.pipeline.async_jobs import (
        _build_page_index,
        _download_input_to_temp,
        _run_metadata_extraction_from_ctx,
        _sync_markdown_and_version,
        _upload_hash_dir,
    )

    stage = str(ctx.get("stage") or "")

    if stage == "parsed":
        extraction_args = (ctx.get("extraction_args") or "").strip()
        if extraction_args:
            _run_metadata_extraction_from_ctx(ctx, api, job_id)
        else:
            patch_job(api, job_id, stage="done")
            console.print(f"[green]Job {job_id} done[/green]")
        return

    if stage == "extracted_metadata":
        patch_job(api, job_id, stage="done")
        console.print(f"[green]Job {job_id} done[/green]")
        return

    if stage != "submitted":
        console.print(f"[yellow]Job {job_id} stage={stage}; nothing to do for markdown ingest[/yellow]")
        return

    if not is_markdown_job_context(ctx):
        _fail_job(api, job_id, "Not a markdown document job")
        raise SystemExit(1)

    cfg = get_cli_settings()
    doc = ctx["document"]
    prefix = ctx["s3_prefix"]
    document_id = doc["id"]

    work = Path(tempfile.mkdtemp(prefix="openkms-md-ingest-"))
    out_base = work / "parsed"
    out_base.mkdir(parents=True, exist_ok=True)

    try:
        stored, content, _ext = _download_input_to_temp(ctx, work)
        console.print(f"[dim]Markdown ingest (document={document_id})[/dim]")
        result, hash_dir = materialize_markdown_ingest(
            stored_input=stored,
            original_content=content,
            out_base=out_base,
            file_hash=doc.get("file_hash") or None,
        )

        from openkms_cli.page_index.strategy import strategy_for_markdown_ingest

        strategy = strategy_for_markdown_ingest(page_index_strategy)
        if page_index_strategy and strategy != (page_index_strategy or "").strip().lower():
            console.print(
                f"[dim]Markdown ingest: using {strategy} for page index "
                f"(layout strategy {page_index_strategy!r} needs cloud parse layouts)[/dim]"
            )
        _build_page_index(
            hash_dir,
            provider=None,
            page_index_strategy=strategy,
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
    except SystemExit:
        raise
    except Exception as e:
        _fail_job(api, job_id, str(e))
        raise SystemExit(1) from e
