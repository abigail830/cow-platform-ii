"""Dispatch native ingest handlers by kind."""

from __future__ import annotations

from pathlib import Path

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.ingest.markdown import materialize_markdown_ingest
from openkms_cli.ingest.xmind.materialize import materialize_xmind_ingest


def run_native_ingest(
    *,
    kind: IngestKind,
    stored_input: Path,
    original_content: bytes,
    out_base: Path,
    file_hash: str | None = None,
) -> tuple[dict, Path]:
    if kind == IngestKind.MARKDOWN:
        return materialize_markdown_ingest(
            stored_input=stored_input,
            original_content=original_content,
            out_base=out_base,
            file_hash=file_hash,
        )
    if kind == IngestKind.XMIND:
        return materialize_xmind_ingest(
            stored_input=stored_input,
            original_content=original_content,
            out_base=out_base,
            file_hash=file_hash,
        )
    raise ValueError(f"No native ingest handler for {kind!r}")
