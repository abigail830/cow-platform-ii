"""Tests for Aliyun layout-based page index builder."""

from openkms_cli.page_index.aliyun_layout import (
    build_page_index_from_aliyun_layouts,
    build_markdown_with_layout_anchors,
    is_indexable_layout,
    layout_anchor_id,
)


def test_layout_anchor_id_uses_unique_id():
    layout = {"uniqueId": "abc123", "index": 5}
    assert layout_anchor_id(layout) == "blk-abc123"


def test_is_indexable_layout_filters_body_text():
    assert not is_indexable_layout({"type": "text", "subType": "para", "text": "Body"})
    assert is_indexable_layout(
        {"type": "title", "subType": "para_title", "text": "Section A", "level": 1}
    )


def test_build_tree_from_levels():
    layouts = [
        {
            "uniqueId": "a",
            "type": "title",
            "subType": "doc_title",
            "text": "Root",
            "level": 0,
            "index": 0,
            "pageNum": 0,
            "markdownContent": "# Root\n",
        },
        {
            "uniqueId": "b",
            "type": "title",
            "subType": "para_title",
            "text": "Child",
            "level": 1,
            "index": 1,
            "pageNum": 0,
            "markdownContent": "## Child\n",
        },
        {
            "uniqueId": "c",
            "type": "text",
            "subType": "para",
            "text": "Body",
            "level": 2,
            "index": 2,
            "pageNum": 0,
            "markdownContent": "Body text",
        },
    ]
    md, anchors = build_markdown_with_layout_anchors(layouts)
    assert 'id="blk-a"' in md
    assert 'id="blk-b"' in md
    assert "blk-c" not in anchors

    tree = build_page_index_from_aliyun_layouts(layouts, doc_name="doc", anchor_lines=anchors)
    structure = tree["structure"]
    assert len(structure) == 1
    assert structure[0]["title"] == "Root"
    assert structure[0]["node_id"] == "blk-a"
    assert len(structure[0]["nodes"]) == 1
    assert structure[0]["nodes"][0]["title"] == "Child"
    assert tree["strategy"] == "aliyun-layouts"
