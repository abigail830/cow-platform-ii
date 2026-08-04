"""Tests for chunk locator resolution."""

from openkms_cli.kb.locator import resolve_chunk_locator

PAGE_INDEX = {
    "structure": [
        {
            "title": "Introduction",
            "node_id": "intro",
            "line_num": 1,
            "page_num": 1,
            "nodes": [
                {
                    "title": "Section A",
                    "node_id": "section-a",
                    "line_num": 10,
                    "page_num": 2,
                }
            ],
        }
    ]
}


def test_resolve_by_heading():
    locator = resolve_chunk_locator(
        "# Introduction\n\n## Section A\n\nBody",
        {"strategy": "markdown_header", "heading": "Section A"},
        PAGE_INDEX,
    )
    assert locator["node_id"] == "section-a"
    assert locator["page_num"] == 2
    assert locator["line_num"] == 10


def test_resolve_by_char_start():
    markdown = "line1\n" * 9 + "target line\n"
    locator = resolve_chunk_locator(
        markdown,
        {"strategy": "fixed_size", "char_start": len("line1\n" * 9)},
        PAGE_INDEX,
    )
    assert locator["line_num"] == 10
    assert locator["node_id"] == "section-a"
