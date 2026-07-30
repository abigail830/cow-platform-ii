"""File extension → Adobe PDF Services upload mediaType."""

from __future__ import annotations

# Formats Paddle reads directly (no Adobe conversion).
NATIVE_PADDLE_EXTENSIONS = frozenset(
    {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
)

# Formats converted to PDF via Adobe Create PDF before Paddle parse.
ADOBE_CONVERT_EXTENSIONS = frozenset(
    {".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".rtf"}
)

# Paddle pipeline does not support EPUB (use baidu-doc-parse).
UNSUPPORTED_PADDLE_EXTENSIONS = frozenset({".epub"})

_EXT_MEDIA_TYPE: dict[str, str] = {
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".rtf": "application/rtf",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".bmp": "image/bmp",
}


def media_type_for_extension(ext: str) -> str:
    key = (ext if ext.startswith(".") else f".{ext}").lower()
    mime = _EXT_MEDIA_TYPE.get(key)
    if not mime:
        raise ValueError(f"No Adobe mediaType mapping for extension {key!r}")
    return mime
