"""Render one XMind sheet to markdown with outline metadata and line anchors."""

from __future__ import annotations

from typing import Any

from openkms_cli.ingest.xmind._markdown import (
    format_blockquote,
    iter_child_topics,
    topic_note_lines,
    topic_suffix,
    topic_title,
)


def count_topics(topic: dict[str, Any]) -> int:
    total = 1
    for child in iter_child_topics(topic):
        total += count_topics(child)
    return total


def render_sheet(
    *,
    sheet_title: str,
    sheet_index: int,
    root_topic: dict[str, Any],
) -> tuple[str, dict[str, Any], dict[str, Any]]:
    """Return markdown body, sheet meta, and outline subtree for page index."""
    lines: list[str] = []
    sheet_line = _append_line(lines, f"# {sheet_title}")
    sheet_outline: dict[str, Any] = {
        "title": sheet_title,
        "line_num": sheet_line,
        "sheet_index": sheet_index,
        "topic_count": count_topics(root_topic),
        "nodes": [],
    }

    root_title = str(root_topic.get("title") or "").strip() or "Untitled"
    root_line = _append_line(
        lines,
        f"## {topic_title(root_topic)}{topic_suffix(root_topic)}",
    )
    root_outline: dict[str, Any] = {
        "title": root_title,
        "line_num": root_line,
        "nodes": [],
    }
    sheet_outline["nodes"].append(root_outline)
    lines.extend(format_blockquote(topic_note_lines(root_topic)))

    children = iter_child_topics(root_topic)
    if children:
        _render_child_topics(children, depth=0, lines=lines, parent_outline=root_outline)

    meta = {
        "name": sheet_title,
        "root_title": root_title,
        "topic_count": sheet_outline["topic_count"],
    }
    return "\n".join(lines), meta, sheet_outline


def _render_child_topics(
    topics: list[dict[str, Any]],
    *,
    depth: int,
    lines: list[str],
    parent_outline: dict[str, Any],
) -> None:
    indent = "  " * depth
    for topic in topics:
        anchor_line = len(lines) + 1
        lines.append(
            f'{indent}<span data-line="{anchor_line}" class="xmind-line-anchor"></span>'
        )
        lines.append(f"{indent}- {topic_title(topic)}{topic_suffix(topic)}")
        outline_node: dict[str, Any] = {
            "title": str(topic.get("title") or "").strip() or "Untitled",
            "line_num": anchor_line,
            "nodes": [],
        }
        parent_outline.setdefault("nodes", []).append(outline_node)

        note_lines = topic_note_lines(topic)
        if note_lines:
            lines.extend(format_blockquote(note_lines, indent=indent + "  "))

        children = iter_child_topics(topic)
        if children:
            _render_child_topics(
                children,
                depth=depth + 1,
                lines=lines,
                parent_outline=outline_node,
            )


def _append_line(lines: list[str], text: str) -> int:
    lines.append(text)
    return len(lines)
