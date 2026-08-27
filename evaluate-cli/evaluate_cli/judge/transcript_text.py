"""Extract spoken transcript text from pipeline markdown artifacts for GT evaluation."""

from __future__ import annotations

import re


_SPEAKER_HEADER_RE = re.compile(
    r"^##\s*\[[^\]]+\]\s*.+|^\*\*\d{2}:\d{2}(:\d{2})?\*\*\s*.+",
)


def extract_transcript_plain_text(raw: str) -> str:
    """
    Return transcript body text only — strip eval/audio pipeline markdown wrappers
    (# title, ASR metadata bullets, speaker timestamp headers).
    Plain references and plain ASR outputs pass through unchanged.
    """
    text = (raw or "").strip()
    if not text:
        return ""

    if not text.startswith("#") and "## [" not in text and not re.search(r"^\*\*\d{2}:\d{2}", text, re.M):
        return text

    lines = text.splitlines()
    parts: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if _SPEAKER_HEADER_RE.match(line):
            i += 1
            while i < len(lines):
                body = lines[i].strip()
                if not body:
                    i += 1
                    continue
                if body.startswith("#") or _SPEAKER_HEADER_RE.match(body) or _is_metadata_line(body):
                    break
                parts.append(body)
                i += 1
            continue
        i += 1

    if parts:
        return "\n".join(parts).strip()

    fallback: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or _is_metadata_line(stripped) or stripped.startswith("#"):
            continue
        if _SPEAKER_HEADER_RE.match(stripped):
            continue
        fallback.append(stripped)
    return "\n".join(fallback).strip()


def _is_metadata_line(line: str) -> bool:
    if line.startswith("- "):
        lowered = line.lower()
        if any(token in lowered for token in ("asr:", "language:", "speakers:", "speaker:")):
            return True
    return False
