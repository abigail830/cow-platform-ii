"""Markdown chunking for RAG knowledge base indexing."""
import re
from typing import Any


def _chunk_fixed_size(text: str, chunk_size: int = 8000, chunk_overlap: int = 50) -> list[dict[str, Any]]:
    chunks = []
    start = 0
    idx = 0
    while start < len(text):
        end = start + chunk_size
        chunk_text = text[start:end]
        if chunk_text.strip():
            chunks.append({
                "content": chunk_text.strip(),
                "chunk_index": idx,
                "metadata": {"strategy": "fixed_size", "char_start": start, "char_end": min(end, len(text))},
            })
            idx += 1
        start = end - chunk_overlap if chunk_overlap < chunk_size else end
    return chunks


def _chunk_markdown_header(text: str, **_kwargs: Any) -> list[dict[str, Any]]:
    sections = re.split(r'(?m)^(#{1,3}\s+.+)$', text)
    chunks = []
    idx = 0
    current = ""
    current_heading = ""

    for part in sections:
        stripped = part.strip()
        if re.match(r'^#{1,3}\s+', stripped):
            if current.strip():
                chunks.append({
                    "content": current.strip(),
                    "chunk_index": idx,
                    "metadata": {"strategy": "markdown_header", "heading": current_heading},
                })
                idx += 1
            current = stripped + "\n"
            current_heading = stripped.lstrip("# ").strip()
        else:
            current += part

    if current.strip():
        chunks.append({
            "content": current.strip(),
            "chunk_index": idx,
            "metadata": {"strategy": "markdown_header", "heading": current_heading},
        })

    return chunks


def _chunk_paragraph(text: str, **_kwargs: Any) -> list[dict[str, Any]]:
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    idx = 0
    for para in paragraphs:
        stripped = para.strip()
        if stripped:
            chunks.append({
                "content": stripped,
                "chunk_index": idx,
                "metadata": {"strategy": "paragraph"},
            })
            idx += 1
    return chunks


CHUNKERS = {
    "fixed_size": _chunk_fixed_size,
    "markdown_header": _chunk_markdown_header,
    "paragraph": _chunk_paragraph,
}

_DEFAULT_CHUNK_SIZE = 8000
_DEFAULT_CHUNK_OVERLAP = 50


def _split_text_segments(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    if chunk_size <= 0 or len(text) <= chunk_size:
        return [text] if text.strip() else []
    segments: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        segment = text[start:end].strip()
        if segment:
            segments.append(segment)
        if end >= len(text):
            break
        start = end - chunk_overlap if chunk_overlap < chunk_size else end
    return segments


def _enforce_max_chunk_size(
    chunks: list[dict[str, Any]],
    chunk_size: int,
    chunk_overlap: int,
) -> list[dict[str, Any]]:
    if chunk_size <= 0:
        return chunks
    out: list[dict[str, Any]] = []
    idx = 0
    for ch in chunks:
        content = ch.get("content") or ""
        base_meta = dict(ch.get("metadata") or {})
        parts = _split_text_segments(content, chunk_size, chunk_overlap)
        if not parts:
            continue
        for part_i, part in enumerate(parts):
            meta = dict(base_meta)
            if len(parts) > 1:
                meta["split_part"] = part_i
                meta["split_parts"] = len(parts)
            out.append({"content": part, "chunk_index": idx, "metadata": meta})
            idx += 1
    return out


def chunk_document(text: str, config: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not config:
        config = {}
    strategy = config.get("strategy", "fixed_size")
    chunker = CHUNKERS.get(strategy, _chunk_fixed_size)
    kwargs = {k: v for k, v in config.items() if k != "strategy"}
    chunks = chunker(text, **kwargs)
    # fixed_size already uses chunk_size / chunk_overlap in the chunker.
    # markdown_header / paragraph: only apply a max-size split when knobs are set.
    if strategy != "fixed_size" and ("chunk_size" in config or "chunk_overlap" in config):
        chunk_size = int(config.get("chunk_size") or _DEFAULT_CHUNK_SIZE)
        chunk_overlap = int(config.get("chunk_overlap") or _DEFAULT_CHUNK_OVERLAP)
        chunks = _enforce_max_chunk_size(chunks, chunk_size, chunk_overlap)
    return chunks


def propagate_metadata(
    doc_metadata: dict | None,
    metadata_keys: list | None,
) -> dict | None:
    """Filter document metadata by KB metadata_keys whitelist."""
    if not metadata_keys:
        return None
    filtered = {k: v for k, v in (doc_metadata or {}).items() if k in metadata_keys}
    return filtered if filtered else None
