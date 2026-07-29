"""PageIndex builder: scan markdown # headings (legacy strategy)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

STRATEGY_NAME = "markdown-headings"


def build_page_index_from_markdown(md_path: Path) -> dict[str, Any]:
    """
    Build PageIndex-compatible tree from markdown file headings.
    Returns { doc_name, structure, strategy }.
    """
    content = md_path.read_text(encoding="utf-8")
    lines = content.split("\n")
    node_list, _ = _extract_nodes_from_markdown(lines)
    tree_structure = _build_tree_from_nodes(node_list)
    _assign_sequential_node_ids(tree_structure)
    _format_structure(
        tree_structure,
        order=["title", "node_id", "summary", "prefix_summary", "line_num", "page_num", "nodes"],
    )
    return {
        "doc_name": md_path.stem,
        "structure": tree_structure,
        "strategy": STRATEGY_NAME,
    }


def write_page_index_from_markdown(md_path: Path, output_path: Path) -> dict[str, Any]:
    tree = build_page_index_from_markdown(md_path)
    output_path.write_text(
        __import__("json").dumps(tree, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return tree


def _extract_nodes_from_markdown(lines: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    header_pattern = re.compile(r"^(#{1,6})\s+(.+)$")
    code_block_pattern = re.compile(r"^```")
    node_list: list[dict[str, Any]] = []
    in_code_block = False

    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()
        if code_block_pattern.match(stripped):
            in_code_block = not in_code_block
            continue
        if not stripped or in_code_block:
            continue
        match = header_pattern.match(stripped)
        if match:
            level = len(match.group(1))
            title = match.group(2).strip()
            node_list.append({"title": title, "line_num": line_num, "level": level})

    return node_list, lines


def _build_tree_from_nodes(node_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not node_list:
        return []

    stack: list[tuple[dict[str, Any], int]] = []
    root_nodes: list[dict[str, Any]] = []
    node_counter = 1

    for node in node_list:
        current_level = node["level"]
        tree_node: dict[str, Any] = {
            "title": node["title"],
            "node_id": str(node_counter).zfill(4),
            "line_num": node["line_num"],
            "nodes": [],
        }
        node_counter += 1

        while stack and stack[-1][1] >= current_level:
            stack.pop()

        if not stack:
            root_nodes.append(tree_node)
        else:
            stack[-1][0]["nodes"].append(tree_node)

        stack.append((tree_node, current_level))

    return root_nodes


def _assign_sequential_node_ids(data: Any, node_id: int = 0) -> int:
    if isinstance(data, dict):
        data["node_id"] = str(node_id).zfill(4)
        node_id += 1
        if "nodes" in data:
            node_id = _assign_sequential_node_ids(data["nodes"], node_id)
    elif isinstance(data, list):
        for item in data:
            node_id = _assign_sequential_node_ids(item, node_id)
    return node_id


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
