"""Document ingest kinds — native (local) vs cloud OCR."""

from __future__ import annotations

from enum import Enum


class IngestKind(str, Enum):
    """How a document is turned into hash_dir artifacts."""

    MARKDOWN = "markdown"
    XMIND = "xmind"
    CLOUD_OCR = "cloud"


MARKDOWN_EXTENSIONS = frozenset({".md", ".markdown"})
XMIND_EXTENSIONS = frozenset({".xmind"})
