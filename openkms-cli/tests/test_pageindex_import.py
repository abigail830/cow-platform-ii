"""Tests for PageIndex KB import helpers."""

from openkms_cli.kb.pageindex_import import (
    MAX_MARKDOWN_BYTES,
    MAX_PARSING_RESULT_BYTES,
    _merge_metadata,
    _slim_parsing_result,
    _trim_markdown,
)


def test_trim_markdown_under_limit():
    text = "hello"
    warnings: list[str] = []
    assert _trim_markdown(text, warnings) == "hello"
    assert warnings == []


def test_trim_markdown_over_limit():
    text = "a" * (MAX_MARKDOWN_BYTES + 100)
    warnings: list[str] = []
    result = _trim_markdown(text, warnings)
    assert result is not None
    assert len(result.encode("utf-8")) <= MAX_MARKDOWN_BYTES
    assert warnings == ["markdown_truncated"]


def test_merge_metadata_prefers_db_when_populated():
    db = {"author": "Alice", "tags": ["a"]}
    sidecar = {"author": "Bob"}
    assert _merge_metadata(db, sidecar) == db


def test_merge_metadata_uses_sidecar_when_db_empty():
    db = {"author": "", "tags": []}
    sidecar = {"author": "Bob", "tags": ["x"]}
    merged = _merge_metadata(db, sidecar)
    assert merged == sidecar


def test_slim_parsing_result_when_small():
    data = {"file_hash": "abc", "markdown": "hi", "parser": "test"}
    warnings: list[str] = []
    assert _slim_parsing_result(data, warnings) == data
    assert warnings == []


def test_slim_parsing_result_when_large():
    huge = {"file_hash": "abc", "markdown": "x" * (MAX_PARSING_RESULT_BYTES + 1000), "parser": "p"}
    warnings: list[str] = []
    slim = _slim_parsing_result(huge, warnings)
    assert warnings == ["parsing_result_slimmed"]
    assert slim.get("file_hash") == "abc"
    assert slim.get("parser") == "p"
    assert "markdown" not in slim
