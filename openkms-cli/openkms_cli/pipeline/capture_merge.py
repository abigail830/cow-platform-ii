"""Parse transcript markdown produced by ASR finalize."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

_TURN_HEADER = re.compile(
    r"^##\s+\[(?P<timestamp>[^\]]+)\]\s+(?P<speaker>.+?)\s*$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class ParsedTurn:
    timestamp: str
    speaker: str
    text: str
    begin_ms: int | None = None


def _parse_timestamp_ms(value: str) -> int | None:
    raw = value.strip()
    if not raw:
        return None
    if raw.isdigit():
        return int(raw)
    parts = raw.split(":")
    try:
        if len(parts) == 3:
            hours, minutes, seconds = parts
            sec_parts = seconds.split(".")
            sec = float(sec_parts[0])
            if len(sec_parts) > 1:
                sec += float(f"0.{sec_parts[1]}")
            return int((int(hours) * 3600 + int(minutes) * 60 + sec) * 1000)
        if len(parts) == 2:
            minutes, seconds = parts
            sec_parts = seconds.split(".")
            sec = float(sec_parts[0])
            if len(sec_parts) > 1:
                sec += float(f"0.{sec_parts[1]}")
            return int((int(minutes) * 60 + sec) * 1000)
    except ValueError:
        return None
    return None


def parse_transcript_markdown(content: str) -> list[ParsedTurn]:
    """Extract speaker turns from transcript.md (## [ts] Speaker blocks)."""
    text = content.strip()
    if not text:
        return []

    matches = list(_TURN_HEADER.finditer(text))
    if not matches:
        plain = text.split("\n", 1)[-1].strip()
        if plain and not plain.startswith("#"):
            return [
                ParsedTurn(
                    timestamp="00:00",
                    speaker="Speaker",
                    text=plain,
                    begin_ms=0,
                )
            ]
        return []

    turns: list[ParsedTurn] = []
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        timestamp = match.group("timestamp").strip()
        speaker = match.group("speaker").strip()
        turns.append(
            ParsedTurn(
                timestamp=timestamp,
                speaker=speaker,
                text=body,
                begin_ms=_parse_timestamp_ms(timestamp),
            )
        )
    return turns


def merge_segment_turns(
    segments: list[dict[str, Any]],
    *,
    transcript_loader: Callable[[str], str],
) -> list[dict[str, Any]]:
    """
    Merge turns from ordered segments into global turn list.

    Each segment dict must include: segment_index, id, name, transcript_s3_key.
    transcript_loader(key) -> markdown str
    """
    merged: list[dict[str, Any]] = []
    turn_counter = 0

    ordered = sorted(segments, key=lambda s: int(s.get("segment_index") or 0))
    for seg_idx, segment in enumerate(ordered):
        key = str(segment.get("transcript_s3_key") or "")
        md = transcript_loader(key)
        turns = parse_transcript_markdown(md)
        for turn in turns:
            turn_counter += 1
            merged.append(
                {
                    "turn_id": f"s{seg_idx}_t{turn_counter:03d}",
                    "segment_index": seg_idx,
                    "segment_id": segment.get("id"),
                    "segment_name": segment.get("name"),
                    "timestamp": turn.timestamp,
                    "begin_ms": turn.begin_ms,
                    "speaker": turn.speaker,
                    "text": turn.text,
                }
            )
    return merged
