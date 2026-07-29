"""Tests for Baidu layout page-index strategy."""

from openkms_cli.page_index_baidu_layout import (
    build_page_index_from_baidu_layouts,
    is_indexable_baidu_layout,
    layout_anchor_id,
)


def test_is_indexable_baidu_layout():
    assert is_indexable_baidu_layout({"type": "doc_title", "text": "Chapter"})
    assert not is_indexable_baidu_layout({"type": "footer", "text": "Foot"})
    assert not is_indexable_baidu_layout({"type": "text", "text": "Body"})


def test_build_page_index_from_baidu_layouts():
    layouts = [
        {"layout_id": "p0-t1", "type": "doc_title", "text": "Root", "page_num": 0},
        {"layout_id": "p0-t2", "type": "paragraph_title", "text": "Section A", "page_num": 0},
        {"layout_id": "p1-t1", "type": "section_title", "text": "Section B", "page_num": 1},
        {"layout_id": "p1-t2", "type": "footer", "text": "ignore", "page_num": 1},
    ]
    tree = build_page_index_from_baidu_layouts(layouts, doc_name="doc.pdf")
    assert tree["strategy"] == "baidu-layouts"
    structure = tree["structure"]
    assert len(structure) == 1
    assert structure[0]["title"] == "Root"
    assert structure[0]["node_id"] == layout_anchor_id(layouts[0])
    assert structure[0]["nodes"][0]["title"] == "Section A"
    assert structure[0]["nodes"][1]["title"] == "Section B"
    assert structure[0]["nodes"][1]["page_num"] == 2
