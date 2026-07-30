"""Markdown emission helpers for XMind topic trees."""

from __future__ import annotations

import re
from typing import Any

_MD_ESCAPE_RE = re.compile(r"([\\`*_{}\[\]()#+\-.!|])")


def escape_md(text: str) -> str:
    return _MD_ESCAPE_RE.sub(r"\\\1", text or "")


def topic_title(topic: dict[str, Any]) -> str:
    title = str(topic.get("title") or "").strip()
    href = str(topic.get("hyperlink") or topic.get("href") or "").strip()
    if href:
        return f"[{escape_md(title)}]({href})"
    return escape_md(title)


def topic_suffix(topic: dict[str, Any]) -> str:
    parts: list[str] = []
    for label in topic.get("labels") or []:
        label_text = str(label).strip()
        if label_text:
            parts.append(f"`{label_text}`")
    markers = topic.get("markers") or topic.get("marker-refs") or []
    for marker in markers:
        marker_id = marker if isinstance(marker, str) else (
            marker.get("markerId") or marker.get("marker-id") or ""
        )
        marker_id = str(marker_id).strip()
        if marker_id:
            parts.append(f"<{marker_id}>")
    return (" " + " ".join(parts)) if parts else ""


def topic_note_lines(topic: dict[str, Any]) -> list[str]:
    notes = topic.get("notes")
    if not notes:
        return []
    if isinstance(notes, str):
        content = notes.strip()
    elif isinstance(notes, dict):
        plain = notes.get("plain")
        if isinstance(plain, dict):
            content = str(plain.get("content") or "").strip()
        else:
            content = str(plain or "").strip()
    else:
        content = str(notes).strip()
    if not content:
        return []
    return [line.rstrip() for line in content.splitlines()]


def format_blockquote(lines: list[str], indent: str = "") -> list[str]:
    if not lines:
        return []
    return [f"{indent}> {line}" if line else f"{indent}>" for line in lines]


def format_root_topic(topic: dict[str, Any]) -> list[str]:
    lines = [f"## {topic_title(topic)}{topic_suffix(topic)}"]
    lines.extend(format_blockquote(topic_note_lines(topic)))
    return lines


def format_child_topics(topics: list[dict[str, Any]], depth: int = 0) -> list[str]:
    lines: list[str] = []
    indent = "  " * depth
    for topic in topics:
        lines.append(f"{indent}- {topic_title(topic)}{topic_suffix(topic)}")
        note_lines = topic_note_lines(topic)
        if note_lines:
            lines.extend(format_blockquote(note_lines, indent=indent + "  "))
        children = iter_child_topics(topic)
        if children:
            lines.extend(format_child_topics(children, depth + 1))
    return lines


def iter_child_topics(topic: dict[str, Any]) -> list[dict[str, Any]]:
    children = topic.get("children")
    if not children:
        return []
    if isinstance(children, list):
        return children
    attached = list(children.get("attached") or [])
    detached = list(children.get("detached") or [])
    return attached + detached
