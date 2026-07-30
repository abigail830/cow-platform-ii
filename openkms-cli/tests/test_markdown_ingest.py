"""Tests for shared markdown ingest (no VLM / cloud parse)."""

import json
from pathlib import Path

import pytest

from openkms_cli.parse.markdown_ingest import (
    build_markdown_parse_result,
    is_markdown_job_context,
    is_markdown_suffix,
    materialize_markdown_ingest,
)


def test_is_markdown_suffix() -> None:
    assert is_markdown_suffix(".md")
    assert is_markdown_suffix("markdown")
    assert not is_markdown_suffix(".pdf")


def test_is_markdown_job_context() -> None:
    assert is_markdown_job_context({"document": {"name": "notes.md"}})
    assert is_markdown_job_context({"input_uri": "s3://b/k/doc.markdown"})
    assert not is_markdown_job_context({"document": {"name": "doc.pdf"}})


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
