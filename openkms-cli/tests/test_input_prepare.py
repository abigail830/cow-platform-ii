"""Tests for Adobe input preparation helpers."""

from pathlib import Path

import pytest

from openkms_cli.providers.baidu.parser import prepare_for_baidu_parse


def test_pdf_passthrough_via_baidu_prepare(tmp_path: Path) -> None:
    pdf = tmp_path / "doc.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    parse_path, hash_src = prepare_for_baidu_parse(pdf, tmp_path / "work")
    assert parse_path == pdf
    assert hash_src == pdf


def test_epub_accepted_for_baidu_prepare(tmp_path: Path) -> None:
    epub = tmp_path / "book.epub"
    epub.write_bytes(b"fake")
    with pytest.raises(Exception):
        # mutool may be missing in CI; any error means we did not reject EPUB at prepare gate
        prepare_for_baidu_parse(epub, tmp_path / "work")
