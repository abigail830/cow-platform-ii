"""Markdown native ingest — no cloud OCR."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from openkms_cli.parse.result import validate_parse_result


def build_markdown_parse_result(file_hash: str, markdown: str) -> dict:
    """Canonical result.json for uploaded Markdown (no OCR layout)."""
    return validate_parse_result(
        {
            "file_hash": file_hash,
            "parsing_res_list": [],
            "layout_det_res": [],
            "markdown": markdown,
            "page_count": 1,
            "document_kind": "markdown",
            "parser": "markdown-ingest",
        }
    )


def materialize_markdown_ingest(
    *,
    stored_input: Path,
    original_content: bytes,
    out_base: Path,
    file_hash: str | None = None,
) -> tuple[dict, Path]:
    """Write hash_dir artifacts: original.*, result.json, markdown.md."""
    resolved_hash = file_hash or hashlib.sha256(original_content).hexdigest()
    try:
        markdown = original_content.decode("utf-8")
    except UnicodeDecodeError as e:
        raise ValueError("Markdown file must be UTF-8 encoded") from e

    result = build_markdown_parse_result(resolved_hash, markdown)
    hash_dir = out_base / resolved_hash
    hash_dir.mkdir(parents=True, exist_ok=True)

    ext = stored_input.suffix.lower().lstrip(".") or "md"
    (hash_dir / f"original.{ext}").write_bytes(original_content)
    (hash_dir / "result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    (hash_dir / "markdown.md").write_text(markdown, encoding="utf-8")
    return result, hash_dir
