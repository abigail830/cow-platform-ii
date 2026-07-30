"""Tests for ingest kind registry."""

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.ingest.registry import (
    input_suffix_from_ctx,
    is_native_ingest,
    native_ingest_extensions,
    resolve_ingest_kind,
    supported_batch_extensions,
)


def test_resolve_ingest_kind_markdown_suffixes() -> None:
    assert resolve_ingest_kind(suffix=".md") == IngestKind.MARKDOWN
    assert resolve_ingest_kind(suffix="markdown") == IngestKind.MARKDOWN
    assert resolve_ingest_kind(suffix=".xmind") == IngestKind.XMIND
    assert resolve_ingest_kind(suffix=".PDF") == IngestKind.CLOUD_OCR


def test_resolve_ingest_kind_from_ctx() -> None:
    assert resolve_ingest_kind(ctx={"document": {"name": "notes.md"}}) == IngestKind.MARKDOWN
    assert resolve_ingest_kind(ctx={"input_uri": "s3://b/k/doc.markdown"}) == IngestKind.MARKDOWN
    assert resolve_ingest_kind(ctx={"document": {"name": "map.xmind"}}) == IngestKind.XMIND
    assert resolve_ingest_kind(ctx={"document": {"name": "scan.pdf"}}) == IngestKind.CLOUD_OCR


def test_input_suffix_from_ctx_prefers_document_name() -> None:
    assert input_suffix_from_ctx(
        {"document": {"name": "a.md"}, "input_uri": "s3://b/k/file.pdf"}
    ) == ".md"


def test_is_native_ingest() -> None:
    assert is_native_ingest(IngestKind.MARKDOWN)
    assert is_native_ingest(IngestKind.XMIND)
    assert not is_native_ingest(IngestKind.CLOUD_OCR)


def test_native_ingest_extensions() -> None:
    exts = native_ingest_extensions()
    assert ".md" in exts
    assert ".xmind" in exts


def test_supported_batch_extensions_includes_markdown_and_pdf() -> None:
    exts = supported_batch_extensions()
    assert ".md" in exts
    assert ".xmind" in exts
    assert ".pdf" in exts
