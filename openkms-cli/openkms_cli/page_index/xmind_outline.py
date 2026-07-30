"""PageIndex builder: XMind topic tree from result.json outline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .markdown import _assign_sequential_node_ids, _format_structure

STRATEGY_NAME = "xmind-outline"


def build_page_index_from_xmind_outline(
    result_path: Path,
    *,
    doc_name: str | None = None,
) -> dict[str, Any] | None:
    data = json.loads(result_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return None
    outline = data.get("outline")
    if not isinstance(outline, list) or not outline:
        return None

    structure = [_outline_node_to_page_index(item) for item in outline if isinstance(item, dict)]
    if not structure:
        return None

    _assign_sequential_node_ids(structure)
    _format_structure(
        structure,
        order=[
            "title",
            "node_id",
            "summary",
            "prefix_summary",
            "line_num",
            "page_num",
            "sheet_index",
            "topic_count",
            "nodes",
        ],
    )
    return {
        "doc_name": doc_name or result_path.parent.name,
        "structure": structure,
        "strategy": STRATEGY_NAME,
    }


def write_page_index_from_xmind_outline(
    result_path: Path,
    output_path: Path,
    *,
    doc_name: str | None = None,
) -> dict[str, Any] | None:
    tree = build_page_index_from_xmind_outline(result_path, doc_name=doc_name)
    if tree is None:
        return None
    output_path.write_text(
        json.dumps(tree, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return tree


def _outline_node_to_page_index(node: dict[str, Any]) -> dict[str, Any]:
    children = node.get("nodes") or []
    tree_node: dict[str, Any] = {
        "title": str(node.get("title") or "").strip() or "Untitled",
        "line_num": node.get("line_num"),
        "nodes": [
            _outline_node_to_page_index(child)
            for child in children
            if isinstance(child, dict)
        ],
    }
    if node.get("sheet_index") is not None:
        tree_node["sheet_index"] = node["sheet_index"]
    if node.get("topic_count") is not None:
        tree_node["topic_count"] = node["topic_count"]
    return tree_node
