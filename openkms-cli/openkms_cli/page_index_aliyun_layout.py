"""PageIndex builder: Aliyun Document Mind layout stream (title types + level)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

STRATEGY_NAME = "aliyun-layouts"
ANCHOR_PREFIX = "blk-"

# Title-like subTypes worth listing in the page index.
_INDEXABLE_SUBTYPES = frozenset(
    {
        "doc_name",
        "doc_subtitle",
        "para_title",
        "cate_title",
        "pic_title",
        "table_name",
    }
)
_INDEXABLE_TYPES = frozenset({"title", "contents_title", "table_name", "figure_name"})
_EXCLUDE_SUBTYPES = frozenset(
    {
        "cate",
        "para",
        "page",
        "page_footer",
        "page_header",
        "footer_note",
        "endnode",
        "sidebar",
    }
)


def layout_anchor_id(layout: dict[str, Any]) -> str:
    uid = layout.get("uniqueId") or layout.get("unique_id")
    if isinstance(uid, str) and uid.strip():
        safe = re.sub(r"[^a-zA-Z0-9_-]", "", uid.strip())
        return f"{ANCHOR_PREFIX}{safe}"
    index = layout.get("index")
    return f"{ANCHOR_PREFIX}idx-{index if index is not None else 0}"


def layout_title(layout: dict[str, Any]) -> str:
    for key in ("text", "markdownContent"):
        raw = layout.get(key)
        if not isinstance(raw, str):
            continue
        text = raw.strip()
        if not text:
            continue
        text = re.sub(r"^#+\s*", "", text)
        text = text.replace("\n", " ").strip()
        if text:
            return text[:500]
    return ""


def is_indexable_layout(layout: dict[str, Any]) -> bool:
    sub_type = str(layout.get("subType") or layout.get("sub_type") or "").lower()
    layout_type = str(layout.get("type") or "").lower()
    if sub_type in _EXCLUDE_SUBTYPES:
        return False
    if sub_type in _INDEXABLE_SUBTYPES:
        return bool(layout_title(layout))
    if layout_type in _INDEXABLE_TYPES and sub_type not in _EXCLUDE_SUBTYPES:
        return bool(layout_title(layout))
    return False


def _layout_sort_key(layout: dict[str, Any]) -> tuple[int, int]:
    page = layout.get("pageNum")
    if page is None:
        page = layout.get("page_num")
    index = layout.get("index")
    return (
        int(page) if isinstance(page, int) else 0,
        int(index) if isinstance(index, int) else 0,
    )


def build_markdown_with_layout_anchors(layouts: list[dict[str, Any]]) -> tuple[str, dict[str, int]]:
    """
    Concatenate layout markdown and inject invisible anchor spans for indexable blocks.
    Returns (markdown, node_id -> line_num).
    """
    parts: list[str] = []
    anchor_lines: dict[str, int] = {}
    line_no = 1

    for layout in sorted(layouts, key=_layout_sort_key):
        md = (layout.get("markdownContent") or layout.get("text") or "").strip()
        if not md:
            continue

        if is_indexable_layout(layout):
            node_id = layout_anchor_id(layout)
            parts.append(f'<span id="{node_id}" data-line="{line_no}" aria-hidden="true"></span>')
            anchor_lines[node_id] = line_no
            line_no += 1

        parts.append(md)
        line_no += max(md.count("\n"), 0) + 1

    return "\n\n".join(parts).strip(), anchor_lines


def build_page_index_from_aliyun_layouts(
    layouts: list[dict[str, Any]],
    *,
    doc_name: str = "document",
    anchor_lines: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Build hierarchical page index from Aliyun layouts using API level + title types."""
    anchor_lines = anchor_lines or {}
    node_list: list[dict[str, Any]] = []

    for layout in sorted(layouts, key=_layout_sort_key):
        if not is_indexable_layout(layout):
            continue
        title = layout_title(layout)
        if not title:
            continue
        node_id = layout_anchor_id(layout)
        level_raw = layout.get("level")
        level = int(level_raw) + 1 if isinstance(level_raw, int) else 1
        node: dict[str, Any] = {
            "title": title,
            "node_id": node_id,
            "level": level,
        }
        if node_id in anchor_lines:
            node["line_num"] = anchor_lines[node_id]
        page_num = layout.get("pageNum")
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


def write_page_index_from_aliyun_layouts(
    layouts: list[dict[str, Any]],
    *,
    doc_name: str,
    output_path: Path,
    markdown_path: Path | None = None,
) -> dict[str, Any]:
    """Optionally rewrite markdown with anchors, then write page_index.json."""
    anchor_lines: dict[str, int] = {}
    if markdown_path is not None:
        markdown, anchor_lines = build_markdown_with_layout_anchors(layouts)
        markdown_path.write_text(markdown, encoding="utf-8")

    tree = build_page_index_from_aliyun_layouts(
        layouts,
        doc_name=doc_name,
        anchor_lines=anchor_lines,
    )
    output_path.write_text(json.dumps(tree, indent=2, ensure_ascii=False), encoding="utf-8")
    return tree


def _build_tree_preserving_node_ids(node_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not node_list:
        return []

    stack: list[tuple[dict[str, Any], int]] = []
    root_nodes: list[dict[str, Any]] = []

    for node in node_list:
        current_level = node["level"]
        tree_node: dict[str, Any] = {
            "title": node["title"],
            "node_id": node["node_id"],
            "nodes": [],
        }
        if "line_num" in node:
            tree_node["line_num"] = node["line_num"]
        if "page_num" in node:
            tree_node["page_num"] = node["page_num"]

        while stack and stack[-1][1] >= current_level:
            stack.pop()

        if not stack:
            root_nodes.append(tree_node)
        else:
            stack[-1][0]["nodes"].append(tree_node)

        stack.append((tree_node, current_level))

    return root_nodes


def _reorder_dict(data: dict[str, Any], key_order: list[str]) -> dict[str, Any]:
    if not key_order:
        return data
    return {k: data[k] for k in key_order if k in data}


def _format_structure(structure: Any, order: list[str]) -> Any:
    if not order:
        return structure
    if isinstance(structure, dict):
        if "nodes" in structure:
            structure["nodes"] = _format_structure(structure["nodes"], order)
        if not structure.get("nodes"):
            structure.pop("nodes", None)
        structure = _reorder_dict(structure, order)
    elif isinstance(structure, list):
        structure = [_format_structure(item, order) for item in structure]
    return structure
