"""Tests for PageIndex KB import helpers."""

from openkms_cli.kb.pageindex_import import (
    MAX_MARKDOWN_BYTES,
    MAX_PARSING_RESULT_BYTES,
    _merge_metadata,
    _prepare_markdown_payload,
    _slim_parsing_result,
)


def test_prepare_markdown_under_limit():
    text = "hello"
    warnings: list[str] = []
    body, s3_key = _prepare_markdown_payload(text, markdown_s3_key="p/markdown.md", warnings=warnings)
    assert body == "hello"
    assert s3_key is None
    assert warnings == []


def test_prepare_markdown_over_limit_uses_s3():
    text = "a" * (MAX_MARKDOWN_BYTES + 100)
    warnings: list[str] = []
    body, s3_key = _prepare_markdown_payload(text, markdown_s3_key="p/markdown.md", warnings=warnings)
    assert body is None
    assert s3_key == "p/markdown.md"
    assert warnings == ["markdown_via_s3"]


def test_merge_metadata_field_level():
    db = {"author": "Alice", "abstract": "", "tags": []}
    sidecar = {"author": "Bob", "abstract": "Doc about X", "tags": ["x"]}
    merged = _merge_metadata(db, sidecar)
    assert merged == {"author": "Alice", "abstract": "Doc about X", "tags": ["x"]}


def test_merge_metadata_uses_sidecar_when_db_empty():
    db = {"author": "", "tags": []}
    sidecar = {"author": "Bob", "tags": ["x"]}
    merged = _merge_metadata(db, sidecar)
    assert merged == {"author": "Bob", "tags": ["x"]}


def test_merge_metadata_prefers_db_nonempty():
    db = {"author": "Alice", "tags": ["a"]}
    sidecar = {"author": "Bob", "tags": ["b"]}
    assert _merge_metadata(db, sidecar) == {"author": "Alice", "tags": ["a"]}


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
