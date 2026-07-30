"""Tests for markdown native ingest."""

import json
from pathlib import Path

import pytest

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.ingest.markdown import build_markdown_parse_result, materialize_markdown_ingest
from openkms_cli.ingest.runner import run_native_ingest


def test_build_markdown_parse_result() -> None:
    file_hash = "a" * 64
    result = build_markdown_parse_result(file_hash, "# Title\n\nBody")
    assert result["file_hash"] == file_hash
    assert result["document_kind"] == "markdown"
    assert result["parser"] == "markdown-ingest"
    assert result["markdown"].startswith("# Title")


def test_materialize_markdown_ingest(tmp_path: Path) -> None:
    src = tmp_path / "readme.md"
    content = b"# Hello\n\nWorld"
    src.write_bytes(content)
    out_base = tmp_path / "parsed"

    result, hash_dir = materialize_markdown_ingest(
        stored_input=src,
        original_content=content,
        out_base=out_base,
    )

    assert hash_dir.is_dir()
    assert (hash_dir / "original.md").read_bytes() == content
    assert (hash_dir / "markdown.md").read_text(encoding="utf-8") == content.decode()
    stored = json.loads((hash_dir / "result.json").read_text(encoding="utf-8"))
    assert stored["parser"] == "markdown-ingest"
    assert result["file_hash"] == stored["file_hash"]


def test_materialize_rejects_non_utf8(tmp_path: Path) -> None:
    src = tmp_path / "bad.md"
    with pytest.raises(ValueError, match="UTF-8"):
        materialize_markdown_ingest(
            stored_input=src,
            original_content=b"\xff\xfe",
            out_base=tmp_path / "out",
        )


def test_run_native_ingest_markdown(tmp_path: Path) -> None:
    src = tmp_path / "doc.md"
    content = b"# Native"
    src.write_bytes(content)
    result, hash_dir = run_native_ingest(
        kind=IngestKind.MARKDOWN,
        stored_input=src,
        original_content=content,
        out_base=tmp_path / "out",
    )
    assert result["parser"] == "markdown-ingest"
    assert (hash_dir / "markdown.md").exists()


def test_run_native_ingest_rejects_cloud_kind(tmp_path: Path) -> None:
    src = tmp_path / "doc.pdf"
    with pytest.raises(ValueError, match="No native ingest handler"):
        run_native_ingest(
            kind=IngestKind.CLOUD_OCR,
            stored_input=src,
            original_content=b"%PDF",
            out_base=tmp_path / "out",
        )
