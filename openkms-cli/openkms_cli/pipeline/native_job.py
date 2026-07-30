"""Async job path for native ingest (markdown, xmind)."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from rich.console import Console

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.ingest.registry import is_native_ingest, resolve_ingest_kind
from openkms_cli.ingest.runner import run_native_ingest
from openkms_cli.pipeline.jobs import patch_job
from openkms_cli.pipeline.post_ingest import (
    download_input_to_temp,
    fail_job,
    finalize_job_artifacts,
    run_metadata_extraction_from_ctx,
)

console = Console(stderr=True)


def run_native_ingest_async_job(
    job_id: str,
    api: str,
    ctx: dict[str, Any],
    *,
    page_index_strategy: str | None = None,
) -> None:
    """Ingest native formats without cloud OCR; then metadata extraction if configured."""
    kind = resolve_ingest_kind(ctx=ctx)
    stage = str(ctx.get("stage") or "")

    if stage == "parsed":
        extraction_args = (ctx.get("extraction_args") or "").strip()
        if extraction_args:
            run_metadata_extraction_from_ctx(ctx, api, job_id)
        else:
            patch_job(api, job_id, stage="done")
            console.print(f"[green]Job {job_id} done[/green]")
        return

    if stage == "extracted_metadata":
        patch_job(api, job_id, stage="done")
        console.print(f"[green]Job {job_id} done[/green]")
        return

    if stage != "submitted":
        console.print(f"[yellow]Job {job_id} stage={stage}; nothing to do for native ingest[/yellow]")
        return

    if not is_native_ingest(kind):
        fail_job(api, job_id, "Not a native ingest document job")
        raise SystemExit(1)

    doc = ctx["document"]
    document_id = doc["id"]

    work = Path(tempfile.mkdtemp(prefix="openkms-native-ingest-"))
    out_base = work / "parsed"
    out_base.mkdir(parents=True, exist_ok=True)

    try:
        stored, content, _ext = download_input_to_temp(ctx, work)
        console.print(f"[dim]Native ingest ({kind.value}, document={document_id})[/dim]")
        result, hash_dir = run_native_ingest(
            kind=kind,
            stored_input=stored,
            original_content=content,
            out_base=out_base,
            file_hash=doc.get("file_hash") or None,
        )
        finalize_job_artifacts(
            api=api,
            job_id=job_id,
            ctx=ctx,
            result=result,
            hash_dir=hash_dir,
            ingest_kind=kind,
            page_index_strategy=page_index_strategy,
            provider=None,
            original_content=content,
        )
    except SystemExit:
        raise
    except Exception as e:
        fail_job(api, job_id, str(e))
        raise SystemExit(1) from e
