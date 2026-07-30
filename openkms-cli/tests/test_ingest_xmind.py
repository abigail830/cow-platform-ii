"""Tests for XMind native ingest."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.ingest.runner import run_native_ingest
from openkms_cli.ingest.xmind import build_xmind_preview
from openkms_cli.ingest.xmind.errors import XmindIngestError
from openkms_cli.ingest.xmind.materialize import build_xmind_parse_result, materialize_xmind_ingest


def _zip_bytes(entries: dict[str, str | bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in entries.items():
            if isinstance(content, str):
                zf.writestr(name, content)
            else:
                zf.writestr(name, content)
    return buf.getvalue()


def _sample_json_content() -> str:
    return json.dumps(
        [
            {
                "title": "Plan",
                "rootTopic": {
                    "title": "Root",
                    "notes": {"plain": {"content": "Root note"}},
                    "children": {
                        "attached": [
                            {
                                "title": "Child",
                                "labels": ["todo"],
                                "children": {
                                    "attached": [{"title": "Grandchild"}],
                                },
                            }
                        ]
                    },
                },
            }
        ]
    )


def test_build_xmind_preview_json_with_attachment() -> None:
    content = _zip_bytes(
        {
            "content.json": _sample_json_content(),
            "attachments/note.txt": b"hello",
        }
    )
    preview = build_xmind_preview(content)

    assert preview["document_kind"] == "mindmap"
    assert preview["format"] == "content.json"
    assert preview["page_count"] == 1
    assert preview["sheets"] == [
        {"name": "Plan", "root_title": "Root", "topic_count": 3},
    ]
    assert "# Plan" in preview["markdown"]
    assert "## Root" in preview["markdown"]
    assert "> Root note" in preview["markdown"]
    assert "- Child `todo`" in preview["markdown"]
    assert "  - Grandchild" in preview["markdown"]
    assert "## Attachments" in preview["markdown"]
    assert "`attachments/note.txt` (5 bytes)" in preview["markdown"]


def test_build_xmind_preview_xml() -> None:
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<xmap-content>
  <sheet title="Legacy">
    <topic id="root">
      <title>Root XML</title>
      <notes><plain>XML note</plain></notes>
      <children>
        <topics type="attached">
          <topic id="child">
            <title>Child XML</title>
          </topic>
        </topics>
      </children>
    </topic>
  </sheet>
</xmap-content>
"""
    content = _zip_bytes({"content.xml": xml})
    preview = build_xmind_preview(content)

    assert preview["format"] == "content.xml"
    assert "# Legacy" in preview["markdown"]
    assert "## Root XML" in preview["markdown"]
    assert "> XML note" in preview["markdown"]
    assert "- Child XML" in preview["markdown"]


def test_build_xmind_preview_rejects_invalid_zip() -> None:
    with pytest.raises(XmindIngestError, match="valid ZIP"):
        build_xmind_preview(b"not-a-zip")


def test_build_xmind_preview_rejects_zip_without_content() -> None:
    content = _zip_bytes({"metadata.json": "{}"})
    with pytest.raises(XmindIngestError, match="content.json or content.xml"):
        build_xmind_preview(content)


def test_build_xmind_parse_result() -> None:
    file_hash = "b" * 64
    preview = {
        "markdown": "# Plan\n",
        "page_count": 1,
        "format": "content.json",
        "sheets": [{"name": "Plan", "root_title": "Root", "topic_count": 1}],
        "attachments": [],
    }
    result = build_xmind_parse_result(file_hash, preview)
    assert result["file_hash"] == file_hash
    assert result["document_kind"] == "mindmap"
    assert result["parser"] == "xmind-ingest"


def test_materialize_xmind_ingest(tmp_path: Path) -> None:
    src = tmp_path / "plan.xmind"
    content = _zip_bytes(
        {
            "content.json": _sample_json_content(),
            "attachments/note.txt": b"hello",
        }
    )
    src.write_bytes(content)
    out_base = tmp_path / "parsed"

    result, hash_dir = materialize_xmind_ingest(
        stored_input=src,
        original_content=content,
        out_base=out_base,
    )

    assert hash_dir.is_dir()
    assert (hash_dir / "original.xmind").read_bytes() == content
    assert (hash_dir / "markdown.md").read_text(encoding="utf-8").startswith("# Plan")
    stored = json.loads((hash_dir / "result.json").read_text(encoding="utf-8"))
    assert stored["parser"] == "xmind-ingest"
    assert result["file_hash"] == stored["file_hash"]


def test_run_native_ingest_xmind(tmp_path: Path) -> None:
    src = tmp_path / "plan.xmind"
    content = _zip_bytes({"content.json": _sample_json_content()})
    src.write_bytes(content)
    result, hash_dir = run_native_ingest(
        kind=IngestKind.XMIND,
        stored_input=src,
        original_content=content,
        out_base=tmp_path / "out",
    )
    assert result["parser"] == "xmind-ingest"
    assert (hash_dir / "markdown.md").exists()
