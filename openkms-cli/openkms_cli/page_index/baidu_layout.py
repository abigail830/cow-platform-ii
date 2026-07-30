"""PageIndex builder: Baidu Cloud parse_result layout stream (title-like types)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .aliyun_layout import _build_tree_preserving_node_ids, _format_structure

STRATEGY_NAME = "baidu-layouts"
ANCHOR_PREFIX = "blk-baidu-"

_INDEXABLE_TYPES = frozenset(
    {
        "doc_title",
        "title",
        "chapter_title",
        "section_title",
        "paragraph_title",
        "catalogue_title",
        "catalogue",
    }
)
_EXCLUDE_TYPES = frozenset(
    {
        "text",
        "footer",
        "header",
        "table",
        "chart",
        "image",
        "header_image",
        "footer_image",
        "figure",
        "figure_caption",
        "table_caption",
        "reference",
        "footnote",
    }
)
_TYPE_LEVEL: dict[str, int] = {
    "doc_title": 1,
    "title": 1,
    "chapter_title": 1,
    "catalogue": 1,
    "section_title": 2,
    "paragraph_title": 2,
    "catalogue_title": 2,
}


def layout_anchor_id(layout: dict[str, Any]) -> str:
    layout_id = layout.get("layout_id")
    if isinstance(layout_id, str) and layout_id.strip():
        safe = re.sub(r"[^a-zA-Z0-9_-]", "", layout_id.strip())
        return f"{ANCHOR_PREFIX}{safe}"
    page = layout.get("page_num", 0)
    index = layout.get("index", 0)
    return f"{ANCHOR_PREFIX}p{page}-i{index}"


def layout_title(layout: dict[str, Any]) -> str:
    raw = layout.get("text")
    if not isinstance(raw, str):
        return ""
    text = raw.strip().replace("\n", " ").strip()
    if not text:
        return ""
    text = re.sub(r"^#+\s*", "", text)
    return text[:500]


def is_indexable_baidu_layout(layout: dict[str, Any]) -> bool:
    layout_type = str(layout.get("type") or "").lower()
    if layout_type in _EXCLUDE_TYPES:
        return False
    if layout_type in _INDEXABLE_TYPES:
        return bool(layout_title(layout))
    if layout_type.endswith("_title"):
        return bool(layout_title(layout))
    return False


def _layout_sort_key(layout: dict[str, Any]) -> tuple[int, int, str]:
    page = layout.get("page_num")
    if page is None:
        page = 0
    layout_id = str(layout.get("layout_id") or "")
    return (int(page) if isinstance(page, int) else 0, 0, layout_id)


def _level_for_layout(layout: dict[str, Any]) -> int:
    layout_type = str(layout.get("type") or "").lower()
    return _TYPE_LEVEL.get(layout_type, 2)


def build_page_index_from_baidu_layouts(
    layouts: list[dict[str, Any]],
    *,
    doc_name: str = "document",
) -> dict[str, Any]:
    """Build hierarchical page index from Baidu pages[].layouts entries."""
    node_list: list[dict[str, Any]] = []

    for layout in sorted(layouts, key=_layout_sort_key):
        if not is_indexable_baidu_layout(layout):
            continue
        title = layout_title(layout)
        if not title:
            continue
        node_id = layout_anchor_id(layout)
        node: dict[str, Any] = {
            "title": title,
            "node_id": node_id,
            "level": _level_for_layout(layout),
        }
        page_num = layout.get("page_num")
        if page_num is not None:
            node["page_num"] = int(page_num) + 1
        node_list.append(node)

    structure = _build_tree_preserving_node_ids(node_list)
    _format_structure(
        structure,
        order=["title", "node_id", "summary", "prefix_summary", "line_num", "page_num", "nodes"],
    )
    return {
        "doc_name": doc_name,
        "structure": structure,
        "strategy": STRATEGY_NAME,
    }


def write_page_index_from_baidu_layouts(
    layouts: list[dict[str, Any]],
    *,
    doc_name: str,
    output_path: Path,
) -> dict[str, Any]:
    tree = build_page_index_from_baidu_layouts(layouts, doc_name=doc_name)
    output_path.write_text(json.dumps(tree, indent=2, ensure_ascii=False), encoding="utf-8")
    return tree
