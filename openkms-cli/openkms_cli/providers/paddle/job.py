"""Sync VLM parse job for paddleocr-doc-parse (no cloud submit/poll)."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from rich.console import Console

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.pipeline.post_ingest import (
    download_input_to_temp,
    fail_job,
    finalize_job_artifacts,
)
from openkms_cli.providers.paddle.vlm_config import resolve_vlm_from_workflow

console = Console(stderr=True)


def run_paddle_vlm_sync_job(
    api: str,
    job_id: str,
    ctx: dict[str, Any],
    *,
    workflow_config: dict[str, Any],
    page_index_strategy: str | None,
) -> None:
    """Download → VLM parse → upload artifacts → metadata (one worker pass)."""
    work = Path(tempfile.mkdtemp(prefix="openkms-paddle-"))
    out_base = work / "parsed"
    out_base.mkdir(parents=True, exist_ok=True)

    try:
        vlm = resolve_vlm_from_workflow(workflow_config)
    except ValueError as e:
        fail_job(api, job_id, str(e))
        raise SystemExit(1) from e

    stored, original_content, _ext = download_input_to_temp(ctx, work)

    try:
        from openkms_cli.parse.office_convert import OfficeConvertError, prepare_for_vlm_parse
        from openkms_cli.parse.parser import run_parser
    except ImportError as e:
        fail_job(
            api,
            job_id,
            f"Paddle VLM parse dependencies missing: {e}. Install: pip install openkms-cli[parse,pipeline]",
        )
        raise SystemExit(1) from e

    try:
        parse_path, hash_src = prepare_for_vlm_parse(stored, work / "office_stage")
    except OfficeConvertError as e:
        fail_job(api, job_id, str(e))
        raise SystemExit(1) from e

    ch_source = None if parse_path.resolve() == hash_src.resolve() else hash_src

    console.print(
        f"[dim]Paddle VLM parse: model={vlm.model_name} base={vlm.base_url.rstrip('/')}[/dim]"
    )
    try:
        result, _extra_files, _markdown_out = run_parser(
            input_path=parse_path,
            output_dir=out_base,
            vlm_url=vlm.base_url,
            vlm_api_key=vlm.api_key,
            model=vlm.model_name,
            max_concurrency=vlm.max_concurrency,
            content_hash_source=ch_source,
        )
    except Exception as e:
        fail_job(api, job_id, f"Paddle VLM parse failed: {e}")
        raise SystemExit(1) from e

    file_hash = result["file_hash"]
    hash_dir = out_base / file_hash
    if not hash_dir.is_dir():
        fail_job(api, job_id, f"Parser did not create output dir {hash_dir}")
        raise SystemExit(1)

    finalize_job_artifacts(
        api=api,
        job_id=job_id,
        ctx=ctx,
        result=result,
        hash_dir=hash_dir,
        ingest_kind=IngestKind.CLOUD_OCR,
        page_index_strategy=page_index_strategy,
        provider="paddle",
        original_content=original_content,
    )
