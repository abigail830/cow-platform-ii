"""Parse legacy XMind content.xml sheets."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

from openkms_cli.ingest.xmind._sheet_render import render_sheet
from openkms_cli.ingest.xmind.errors import XmindIngestError

_XLINK_HREF = "{http://www.w3.org/1999/xlink}href"


def _text_content(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return "".join(element.itertext()).strip()


def _topic_from_xml(topic_el: ET.Element) -> dict[str, Any]:
    title_el = topic_el.find("title")
    title = _text_content(title_el)

    notes_el = topic_el.find("notes")
    note_text = ""
    if notes_el is not None:
        plain_el = notes_el.find("plain")
        note_text = _text_content(plain_el if plain_el is not None else notes_el)

    labels = [
        _text_content(label_el)
        for label_el in topic_el.findall("./labels/label")
        if _text_content(label_el)
    ]

    markers = []
    for marker_el in topic_el.findall("./markers/marker"):
        marker_id = marker_el.get("marker-id") or marker_el.get("markerId") or _text_content(marker_el)
        if marker_id:
            markers.append(marker_id)

    href = topic_el.get(_XLINK_HREF) or topic_el.get("href") or ""

    children: list[dict[str, Any]] = []
    children_el = topic_el.find("children")
    if children_el is not None:
        for topics_el in children_el.findall("topics"):
            for child_el in topics_el.findall("topic"):
                children.append(_topic_from_xml(child_el))

    topic: dict[str, Any] = {"title": title}
    if note_text:
        topic["notes"] = {"plain": {"content": note_text}}
    if labels:
        topic["labels"] = labels
    if markers:
        topic["markers"] = markers
    if href:
        topic["href"] = href
    if children:
        topic["children"] = {"attached": children}
    return topic


def load_xml_sheets(raw: bytes) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise XmindIngestError("Invalid content.xml") from e

    sheets: list[dict[str, Any]] = []
    for sheet_el in root.findall(".//sheet"):
        topic_el = sheet_el.find("topic")
        if topic_el is None:
            continue
        sheet_title = sheet_el.get("title") or _text_content(sheet_el.find("title")) or ""
        sheets.append(
            {
                "title": sheet_title,
                "rootTopic": _topic_from_xml(topic_el),
            }
        )

    if not sheets:
        topic_el = root.find(".//topic")
        if topic_el is None:
            raise XmindIngestError("No sheets found in content.xml")
        sheets.append({"title": "", "rootTopic": _topic_from_xml(topic_el)})
    return sheets


def sheet_to_markdown(sheet: dict[str, Any], index: int) -> tuple[str, dict[str, Any], dict[str, Any]]:
    root = sheet.get("rootTopic")
    if not isinstance(root, dict):
        raise XmindIngestError(f"Sheet {index + 1} has no root topic")

    title = str(sheet.get("title") or "").strip() or f"Sheet {index + 1}"
    return render_sheet(sheet_title=title, sheet_index=index, root_topic=root)
