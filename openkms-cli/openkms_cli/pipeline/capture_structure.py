"""Structure, classify, and extract for capture post-process (rules + optional LLM)."""

from __future__ import annotations

import json
import re
from typing import Any

from openkms_cli.pipeline.capture_config import apply_prompt_template


MAX_LLM_TURNS_TEXT_CHARS = 12_000


def _window_turns(
    turns: list[dict[str, Any]],
    *,
    window_minutes: int,
) -> list[list[dict[str, Any]]]:
    if not turns:
        return []
    window_ms = window_minutes * 60 * 1000
    windows: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    window_start = turns[0].get("begin_ms") or 0

    for turn in turns:
        begin = turn.get("begin_ms")
        if begin is not None and current and begin - window_start >= window_ms:
            windows.append(current)
            current = []
            window_start = begin
        current.append(turn)
    if current:
        windows.append(current)
    return windows


def build_topics(
    turns: list[dict[str, Any]],
    *,
    window_minutes: int = 12,
    preview_max_chars: int = 160,
) -> list[dict[str, Any]]:
    topics: list[dict[str, Any]] = []
    for idx, window in enumerate(_window_turns(turns, window_minutes=window_minutes), start=1):
        speakers = sorted({str(t.get("speaker") or "Speaker") for t in window})
        preview = " ".join(str(t.get("text") or "") for t in window[:3]).strip()
        if len(preview) > preview_max_chars:
            preview = preview[: preview_max_chars - 3] + "..."
        topics.append(
            {
                "topic_id": f"topic_{idx:02d}",
                "title": preview or f"Topic {idx}",
                "speakers": speakers,
                "turn_ids": [t["turn_id"] for t in window if t.get("turn_id")],
                "summary": preview,
            }
        )
    return topics


def build_chapters(topics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chapters: list[dict[str, Any]] = []
    for idx, topic in enumerate(topics, start=1):
        chapters.append(
            {
                "chapter_id": f"chapter_{idx:02d}",
                "title": topic.get("title") or f"Chapter {idx}",
                "topic_ids": [topic.get("topic_id")],
            }
        )
    return chapters


def _match_facets(text: str, facet_keywords: dict[str, list[str]], default_facet: str) -> list[str]:
    lowered = text.lower()
    matched: list[str] = []
    for facet, keywords in facet_keywords.items():
        if any(str(keyword).lower() in lowered for keyword in keywords):
            matched.append(facet)
    return matched or [default_facet]


def classify_capture(
    *,
    recording_mode_hint: str | None,
    audience: str,
    turns: list[dict[str, Any]],
    topics: list[dict[str, Any]],
    classify_cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = classify_cfg or {}
    threshold = float(cfg.get("confidence_threshold") or 0.7)
    facet_keywords = cfg.get("facet_keywords") if isinstance(cfg.get("facet_keywords"), dict) else {}
    default_facet = str(cfg.get("default_facet") or "general_discussion")
    speaker_rules = cfg.get("speaker_count_rules") if isinstance(cfg.get("speaker_count_rules"), dict) else {}

    speakers = {str(t.get("speaker") or "") for t in turns if t.get("speaker")}
    speaker_count = len(speakers)
    solo_max = int(speaker_rules.get("solo_voice_note_max_speakers") or 1)
    multi_min = int(speaker_rules.get("multi_party_min_speakers") or 4)

    if recording_mode_hint:
        mode = recording_mode_hint
        confidence = float(cfg.get("confidence_by_hint") or 0.85)
    elif speaker_count <= solo_max:
        mode = "solo_voice_note"
        confidence = float(cfg.get("confidence_solo") or 0.75)
    elif speaker_count >= multi_min:
        mode = "multi_party_discussion"
        confidence = float(cfg.get("confidence_multi_party") or 0.7)
    else:
        mode = "general"
        confidence = float(cfg.get("confidence_general") or 0.55)

    facets: list[dict[str, Any]] = []
    for topic in topics:
        title = str(topic.get("title") or "")
        summary = str(topic.get("summary") or "")
        topic_facets = _match_facets(f"{title} {summary}", facet_keywords, default_facet)
        facets.append(
            {
                "topic_id": topic.get("topic_id"),
                "content_facets": topic_facets,
            }
        )

    return {
        "recording_mode": mode,
        "audience": audience or "unknown",
        "confidence": confidence,
        "needs_review": confidence < threshold,
        "content_facets_by_topic": facets,
    }


def extract_knowledge(
    *,
    capture: dict[str, Any],
    classification: dict[str, Any],
    topics: list[dict[str, Any]],
    turns: list[dict[str, Any]],
    extract_cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = extract_cfg or {}
    key_point_max = int(cfg.get("key_point_max_chars") or 280)
    turn_by_id = {t["turn_id"]: t for t in turns if t.get("turn_id")}
    topic_extractions: list[dict[str, Any]] = []

    for topic in topics:
        texts = [
            str(turn_by_id[tid].get("text") or "")
            for tid in topic.get("turn_ids") or []
            if tid in turn_by_id
        ]
        combined = " ".join(texts).strip()
        topic_extractions.append(
            {
                "topic_id": topic.get("topic_id"),
                "title": topic.get("title"),
                "key_points": [combined[:key_point_max]] if combined else [],
                "action_items": [],
                "open_questions": [],
            }
        )

    return {
        "capture_id": capture.get("id"),
        "title": capture.get("title"),
        "recording_mode": classification.get("recording_mode"),
        "audience": classification.get("audience"),
        "topics": topic_extractions,
        "participants_hint": capture.get("participants_hint"),
    }


def _parse_json_object(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(cleaned[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("Expected JSON object")
    return parsed


def _chat_completions_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    if re.search(r"/v\d+$", base, re.I):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text", "")))
        return "".join(parts).strip()
    return ""


def chat_json(
    model_params: dict[str, Any],
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
) -> dict[str, Any]:
    import requests

    url = _chat_completions_url(str(model_params.get("base_url") or ""))
    body: dict[str, Any] = {
        "model": model_params["model_name"],
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }
    if model_params.get("max_completion_tokens"):
        body["max_completion_tokens"] = int(model_params["max_completion_tokens"])
    elif model_params.get("max_tokens"):
        body["max_tokens"] = int(model_params["max_tokens"])

    resp = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {model_params['api_key']}",
        },
        json=body,
        timeout=180,
    )
    if not resp.ok:
        raise RuntimeError(f"chat {resp.status_code} {resp.text[:300]}")
    data = resp.json()
    message = (data.get("choices") or [{}])[0].get("message") or {}
    raw = _message_text(message)
    if not raw:
        raise RuntimeError("LLM returned empty content")
    return _parse_json_object(raw)


def llm_build_topics(
    *,
    turns: list[dict[str, Any]],
    capture: dict[str, Any],
    segment_cfg: dict[str, Any],
    model_params: dict[str, Any],
    temperature: float,
) -> list[dict[str, Any]]:
    llm_cfg = segment_cfg.get("llm") if isinstance(segment_cfg.get("llm"), dict) else {}
    system_prompt = str(llm_cfg.get("system_prompt") or "")
    user_template = str(llm_cfg.get("user_prompt_template") or "")
    window_minutes = int(segment_cfg.get("window_minutes") or 12)

    topics: list[dict[str, Any]] = []
    windows = _window_turns(turns, window_minutes=window_minutes)
    for idx, window in enumerate(windows, start=1):
        payload = chat_json(
            model_params,
            system_prompt=system_prompt,
            user_prompt=apply_prompt_template(
                user_template,
                {
                    "title": str(capture.get("title") or ""),
                    "brief": str(capture.get("brief") or ""),
                    "window_index": str(idx),
                    "window_count": str(len(windows)),
                    "turns_json": json.dumps(
                        [
                            {
                                "turn_id": t.get("turn_id"),
                                "speaker": t.get("speaker"),
                                "text": t.get("text"),
                            }
                            for t in window
                        ],
                        ensure_ascii=False,
                    ),
                },
            ),
            temperature=temperature,
        )
        window_topics = payload.get("topics")
        if not isinstance(window_topics, list):
            continue
        for item in window_topics:
            if not isinstance(item, dict):
                continue
            topic_id = f"topic_{len(topics) + 1:02d}"
            topics.append(
                {
                    "topic_id": topic_id,
                    "title": str(item.get("title") or topic_id),
                    "summary": str(item.get("summary") or item.get("title") or ""),
                    "speakers": sorted({str(t.get("speaker") or "Speaker") for t in window}),
                    "turn_ids": [
                        str(tid)
                        for tid in (item.get("turn_ids") or [])
                        if isinstance(tid, str)
                    ]
                    or [t["turn_id"] for t in window if t.get("turn_id")],
                }
            )
    if not topics and turns:
        topics = build_topics(
            turns,
            window_minutes=window_minutes,
            preview_max_chars=int(segment_cfg.get("preview_max_chars") or 160),
        )
    return topics


def llm_classify_capture(
    *,
    capture: dict[str, Any],
    audience: str,
    topics: list[dict[str, Any]],
    classify_cfg: dict[str, Any],
    model_params: dict[str, Any],
    temperature: float,
) -> dict[str, Any]:
    llm_cfg = classify_cfg.get("llm") if isinstance(classify_cfg.get("llm"), dict) else {}
    threshold = float(classify_cfg.get("confidence_threshold") or 0.7)
    recording_modes = classify_cfg.get("recording_modes") or []
    content_facets = classify_cfg.get("content_facets") or []

    payload = chat_json(
        model_params,
        system_prompt=str(llm_cfg.get("system_prompt") or ""),
        user_prompt=apply_prompt_template(
            str(llm_cfg.get("user_prompt_template") or ""),
            {
                "title": str(capture.get("title") or ""),
                "brief": str(capture.get("brief") or ""),
                "participants_hint": str(capture.get("participants_hint") or ""),
                "recording_mode_hint": str(capture.get("recording_mode") or ""),
                "audience": audience,
                "confidence_threshold": str(threshold),
                "recording_modes": "\n".join(f"- {mode}" for mode in recording_modes),
                "content_facets": "\n".join(f"- {facet}" for facet in content_facets),
                "topics_json": json.dumps(
                    [
                        {
                            "topic_id": t.get("topic_id"),
                            "title": t.get("title"),
                            "summary": t.get("summary"),
                        }
                        for t in topics
                    ],
                    ensure_ascii=False,
                ),
            },
        ),
        temperature=temperature,
    )

    confidence = float(payload.get("confidence") or 0.0)
    payload["needs_review"] = bool(payload.get("needs_review", confidence < threshold))
    payload["audience"] = audience or payload.get("audience") or "unknown"
    return payload


def llm_extract_knowledge(
    *,
    capture: dict[str, Any],
    classification: dict[str, Any],
    topics: list[dict[str, Any]],
    turns: list[dict[str, Any]],
    extract_cfg: dict[str, Any],
    model_params: dict[str, Any],
    temperature: float,
) -> dict[str, Any]:
    llm_cfg = extract_cfg.get("llm") if isinstance(extract_cfg.get("llm"), dict) else {}
    turn_by_id = {t["turn_id"]: t for t in turns if t.get("turn_id")}
    topic_extractions: list[dict[str, Any]] = []

    for topic in topics:
        turn_lines = []
        for tid in topic.get("turn_ids") or []:
            turn = turn_by_id.get(tid)
            if not turn:
                continue
            turn_lines.append(f"[{turn.get('speaker')}] {turn.get('text')}")
        turns_text = "\n".join(turn_lines)
        if len(turns_text) > MAX_LLM_TURNS_TEXT_CHARS:
            turns_text = turns_text[:MAX_LLM_TURNS_TEXT_CHARS] + "\n... [truncated for model input]"
        payload = chat_json(
            model_params,
            system_prompt=str(llm_cfg.get("system_prompt") or ""),
            user_prompt=apply_prompt_template(
                str(llm_cfg.get("user_prompt_template") or ""),
                {
                    "title": str(capture.get("title") or ""),
                    "recording_mode": str(classification.get("recording_mode") or ""),
                    "audience": str(classification.get("audience") or ""),
                    "topic_title": str(topic.get("title") or ""),
                    "topic_summary": str(topic.get("summary") or ""),
                    "turns_text": turns_text,
                },
            ),
            temperature=temperature,
        )
        topic_extractions.append(
            {
                "topic_id": topic.get("topic_id"),
                "title": topic.get("title"),
                "key_points": payload.get("key_points") or [],
                "action_items": payload.get("action_items") or [],
                "open_questions": payload.get("open_questions") or [],
            }
        )

    return {
        "capture_id": capture.get("id"),
        "title": capture.get("title"),
        "recording_mode": classification.get("recording_mode"),
        "audience": classification.get("audience"),
        "topics": topic_extractions,
        "participants_hint": capture.get("participants_hint"),
    }
