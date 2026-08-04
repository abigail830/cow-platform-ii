"""Map RAG chunks to page_index locators for source traceability."""

from __future__ import annotations

import re
from typing import Any


def _normalize_title(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _flatten_nodes(tree: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not tree:
        return []

    nodes: list[dict[str, Any]] = []

    def walk(items: list[dict[str, Any]] | None) -> None:
        for item in items or []:
            nodes.append(item)
            walk(item.get("nodes"))

    walk(tree.get("structure"))
    return nodes


def _line_at_char(text: str, char_pos: int) -> int:
    if char_pos <= 0:
        return 1
    return text[:char_pos].count("\n") + 1


def _pick_node_by_line(nodes: list[dict[str, Any]], line_num: int) -> dict[str, Any] | None:
    candidates = [
        node
        for node in nodes
        if isinstance(node.get("line_num"), int) and node["line_num"] <= line_num
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda node: node["line_num"])


def _pick_node_by_heading(nodes: list[dict[str, Any]], heading: str) -> dict[str, Any] | None:
    target = _normalize_title(heading)
    if not target:
        return None

    exact = [node for node in nodes if _normalize_title(str(node.get("title") or "")) == target]
    if exact:
        return exact[0]

    partial = [
        node
        for node in nodes
        if target in _normalize_title(str(node.get("title") or ""))
        or _normalize_title(str(node.get("title") or "")) in target
    ]
    return partial[0] if partial else None


def _node_locator(node: dict[str, Any]) -> dict[str, Any]:
    locator: dict[str, Any] = {}
    if node.get("node_id"):
        locator["node_id"] = node["node_id"]
    if isinstance(node.get("page_num"), int):
        locator["page_num"] = node["page_num"]
    if isinstance(node.get("line_num"), int):
        locator["line_num"] = node["line_num"]
    if isinstance(node.get("sheet_index"), int):
        locator["sheet_index"] = node["sheet_index"]
    title = node.get("title")
    if isinstance(title, str) and title.strip():
        locator["heading"] = title.strip()
    return locator


def resolve_chunk_locator(
    markdown: str,
    chunk_metadata: dict[str, Any] | None,
    page_index: dict[str, Any] | None,
) -> dict[str, Any]:
    """Return locator fields to merge into chunk_metadata."""
    meta = dict(chunk_metadata or {})
    nodes = _flatten_nodes(page_index)
    if not nodes:
        return {}

    node: dict[str, Any] | None = None
    heading = meta.get("heading")
    if isinstance(heading, str) and heading.strip():
        node = _pick_node_by_heading(nodes, heading)

    if node is None and isinstance(meta.get("char_start"), int):
        line_num = _line_at_char(markdown, int(meta["char_start"]))
        node = _pick_node_by_line(nodes, line_num)
        if node is None:
            return {"line_num": line_num}

    if node is None:
        return {}

    return _node_locator(node)
