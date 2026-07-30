"""Parse XMind Zen / 8+ content.json sheets."""

from __future__ import annotations

import json
from typing import Any

from openkms_cli.ingest.xmind._sheet_render import render_sheet
from openkms_cli.ingest.xmind.errors import XmindIngestError


def load_json_sheets(raw: bytes) -> list[dict[str, Any]]:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise XmindIngestError("Invalid content.json") from e

    if isinstance(data, list):
        return [sheet for sheet in data if isinstance(sheet, dict)]
    if isinstance(data, dict):
        sheets = data.get("sheets")
        if isinstance(sheets, list):
            return [sheet for sheet in sheets if isinstance(sheet, dict)]
        if "rootTopic" in data:
            return [data]
    raise XmindIngestError("Unrecognized content.json structure")


def sheet_name(sheet: dict[str, Any], index: int) -> str:
    title = str(sheet.get("title") or "").strip()
    return title or f"Sheet {index + 1}"


def sheet_to_markdown(sheet: dict[str, Any], index: int) -> tuple[str, dict[str, Any], dict[str, Any]]:
    root = sheet.get("rootTopic")
    if not isinstance(root, dict):
        raise XmindIngestError(f"Sheet {index + 1} has no rootTopic")
    return render_sheet(
        sheet_title=sheet_name(sheet, index),
        sheet_index=index,
        root_topic=root,
    )
