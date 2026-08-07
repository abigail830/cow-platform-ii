"""Extractive node summaries for PageIndex trees (no LLM required)."""

from __future__ import annotations

from typing import Any

_SUMMARY_MAX_CHARS = 280


def _as_int(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _walk(nodes: list[Any] | None) -> list[dict[str, Any]]:
    flat: list[dict[str, Any]] = []
    if not nodes:
        return flat
    for raw in nodes:
        if not isinstance(raw, dict):
            continue
        flat.append(raw)
        children = raw.get("nodes")
        if isinstance(children, list):
            flat.extend(_walk(children))
    return flat


def _section_text(lines: list[str], start_line: int, end_line: int | None) -> str:
    # line_num is 1-based inclusive start
    start_idx = max(0, start_line - 1)
    end_idx = len(lines) if end_line is None else max(start_idx, end_line - 1)
    chunk = "\n".join(lines[start_idx:end_idx]).strip()
    # Drop the heading line itself when present
    chunk_lines = chunk.split("\n")
    if chunk_lines and chunk_lines[0].lstrip().startswith("#"):
        chunk = "\n".join(chunk_lines[1:]).strip()
    return chunk


def _summarize_text(text: str, max_chars: int = _SUMMARY_MAX_CHARS) -> str:
    collapsed = " ".join(text.split())
    if not collapsed:
        return ""
    if len(collapsed) <= max_chars:
        return collapsed
    cut = collapsed[: max_chars - 1].rsplit(" ", 1)[0]
    return (cut or collapsed[: max_chars - 1]).rstrip() + "…"


def enrich_page_index_summaries(tree: dict[str, Any], markdown: str) -> dict[str, Any]:
    """
    Fill missing summary / prefix_summary on nodes using extractive text between line bounds.
    Nodes without line_num are left unchanged (page-only trees still keep title for navigation).
    """
    structure = tree.get("structure")
    if not isinstance(structure, list) or not markdown:
        return tree

    lines = markdown.split("\n")
    flat = _walk(structure)
    line_nodes = [(node, _as_int(node.get("line_num"))) for node in flat]
    line_nodes = [(n, ln) for n, ln in line_nodes if ln is not None]
    line_nodes.sort(key=lambda item: item[1] or 0)

    for idx, (node, start) in enumerate(line_nodes):
        assert start is not None
        end = line_nodes[idx + 1][1] if idx + 1 < len(line_nodes) else None
        body = _section_text(lines, start, end)
        summary = _summarize_text(body)
        if summary:
            if not str(node.get("summary") or "").strip():
                node["summary"] = summary
            if not str(node.get("prefix_summary") or "").strip():
                # prefix = first sentence-ish of the same extract
                node["prefix_summary"] = _summarize_text(body, max_chars=160)

    return tree
