"""Resolve ingest kind from file suffix or async job context."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from openkms_cli.ingest.kinds import MARKDOWN_EXTENSIONS, XMIND_EXTENSIONS, IngestKind


def normalize_suffix(suffix: str) -> str:
    return (suffix if suffix.startswith(".") else f".{suffix}").lower()


def input_suffix_from_ctx(ctx: dict[str, Any]) -> str:
    doc = ctx.get("document") or {}
    name = str(doc.get("name") or "").strip()
    if name:
        suf = Path(name).suffix.lower()
        if suf:
            return suf
    input_uri = str(ctx.get("input_uri") or "")
    if input_uri:
        return Path(input_uri).suffix.lower()
    return ""


def resolve_ingest_kind(
    *,
    suffix: str | None = None,
    ctx: dict[str, Any] | None = None,
) -> IngestKind:
    """Pick ingest handler from file extension (path suffix or job context)."""
    if suffix is None:
        if ctx is None:
            raise ValueError("resolve_ingest_kind requires suffix or ctx")
        suffix = input_suffix_from_ctx(ctx)
    normalized = normalize_suffix(suffix) if suffix else ""
    if normalized in MARKDOWN_EXTENSIONS:
        return IngestKind.MARKDOWN
    if normalized in XMIND_EXTENSIONS:
        return IngestKind.XMIND
    return IngestKind.CLOUD_OCR


def is_native_ingest(kind: IngestKind) -> bool:
    return kind != IngestKind.CLOUD_OCR


def native_ingest_extensions() -> frozenset[str]:
    return MARKDOWN_EXTENSIONS | XMIND_EXTENSIONS


def supported_batch_extensions() -> set[str]:
    """Extensions accepted by parse run batch scan."""
    from openkms_cli.providers.baidu.parser import _BAIDU_ADOBE_EXT, _BAIDU_NATIVE_EXT

    return (
        set(_BAIDU_NATIVE_EXT)
        | {".epub"}
        | set(_BAIDU_ADOBE_EXT)
        | set(MARKDOWN_EXTENSIONS)
        | set(XMIND_EXTENSIONS)
    )
