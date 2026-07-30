"""Build outline markdown and parsing metadata from XMind bytes."""

from __future__ import annotations

import hashlib
import io
import zipfile
from typing import Any

from openkms_cli.ingest.xmind._json import load_json_sheets, sheet_to_markdown as json_sheet_to_markdown
from openkms_cli.ingest.xmind._xml import load_xml_sheets, sheet_to_markdown as xml_sheet_to_markdown
from openkms_cli.ingest.xmind.errors import XmindIngestError

_EXCLUDED_ZIP_ENTRIES = frozenset(
    {
        "content.json",
        "content.xml",
        "metadata.json",
        "manifest.json",
        "meta.xml",
        "styles.xml",
    }
)


def build_xmind_preview(content: bytes, *, file_hash: str | None = None) -> dict[str, Any]:
    """
    Parse a .xmind ZIP archive into outline markdown and mindmap metadata.

    Returns a dict with markdown, format, page_count, sheets, attachments.
    """
    resolved_hash = file_hash or hashlib.sha256(content).hexdigest()
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as e:
        raise XmindIngestError("File is not a valid ZIP archive") from e

    with zf:
        names = set(zf.namelist())
        if "content.json" in names:
            fmt = "content.json"
            sheets = load_json_sheets(zf.read("content.json"))
            sheet_md = json_sheet_to_markdown
        elif "content.xml" in names:
            fmt = "content.xml"
            sheets = load_xml_sheets(zf.read("content.xml"))
            sheet_md = xml_sheet_to_markdown
        else:
            raise XmindIngestError("No readable content.json or content.xml in archive")

        if not sheets:
            raise XmindIngestError("XMind file contains no sheets")

        markdown_parts: list[str] = []
        sheet_meta: list[dict[str, Any]] = []
        outline: list[dict[str, Any]] = []
        for index, sheet in enumerate(sheets):
            part, meta, sheet_outline = sheet_md(sheet, index)
            markdown_parts.append(part)
            sheet_meta.append(meta)
            outline.append(sheet_outline)

        attachments = _list_attachments(zf)
        if attachments:
            attachment_lines = ["## Attachments", ""]
            for entry in attachments:
                attachment_lines.append(
                    f"- `{entry['path']}` ({entry['size_bytes']} bytes)"
                )
            markdown_parts.append("\n".join(attachment_lines))

        markdown = "\n\n".join(markdown_parts).strip() + "\n"
        return {
            "file_hash": resolved_hash,
            "document_kind": "mindmap",
            "format": fmt,
            "page_count": len(sheet_meta),
            "sheets": sheet_meta,
            "attachments": attachments,
            "outline": outline,
            "markdown": markdown,
        }


def _list_attachments(zf: zipfile.ZipFile) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for name in zf.namelist():
        if name.endswith("/"):
            continue
        if name.startswith("Thumbnails/"):
            continue
        base = name.rsplit("/", 1)[-1]
        if name in _EXCLUDED_ZIP_ENTRIES or base in _EXCLUDED_ZIP_ENTRIES:
            continue
        info = zf.getinfo(name)
        entries.append({"path": name, "size_bytes": info.file_size})
    entries.sort(key=lambda item: item["path"])
    return entries
