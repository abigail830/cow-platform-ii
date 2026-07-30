"""Write hash_dir artifacts for XMind native ingest."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from openkms_cli.ingest.xmind.errors import XmindIngestError
from openkms_cli.ingest.xmind.preview import build_xmind_preview
from openkms_cli.parse.result import validate_parse_result


def build_xmind_parse_result(file_hash: str, preview: dict) -> dict:
    """Canonical result.json for uploaded XMind (no OCR layout)."""
    return validate_parse_result(
        {
            "file_hash": file_hash,
            "parsing_res_list": [],
            "layout_det_res": [],
            "markdown": preview["markdown"],
            "page_count": preview["page_count"],
            "document_kind": "mindmap",
            "parser": "xmind-ingest",
            "format": preview["format"],
            "sheets": preview["sheets"],
            "attachments": preview["attachments"],
            "outline": preview.get("outline") or [],
        }
    )


def materialize_xmind_ingest(
    *,
    stored_input: Path,
    original_content: bytes,
    out_base: Path,
    file_hash: str | None = None,
) -> tuple[dict, Path]:
    """Write hash_dir artifacts: original.xmind, result.json, markdown.md."""
    resolved_hash = file_hash or hashlib.sha256(original_content).hexdigest()
    try:
        preview = build_xmind_preview(original_content, file_hash=resolved_hash)
    except XmindIngestError as e:
        raise ValueError(str(e)) from e

    result = build_xmind_parse_result(resolved_hash, preview)
    hash_dir = out_base / resolved_hash
    hash_dir.mkdir(parents=True, exist_ok=True)

    ext = stored_input.suffix.lower().lstrip(".") or "xmind"
    (hash_dir / f"original.{ext}").write_bytes(original_content)
    (hash_dir / "result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    (hash_dir / "markdown.md").write_text(preview["markdown"], encoding="utf-8")
    return result, hash_dir
