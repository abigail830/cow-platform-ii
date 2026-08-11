"""Render capture summary.md from structured post-process artifacts."""

from __future__ import annotations

import json
from typing import Any

from openkms_cli.pipeline.capture_config import apply_prompt_template
from openkms_cli.pipeline.capture_structure import chat_text


def _topic_summary_by_id(structured_topics: list[dict[str, Any]] | None) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for topic in structured_topics or []:
        topic_id = topic.get("topic_id")
        if not topic_id:
            continue
        summary = str(topic.get("summary") or "").strip()
        if summary:
            lookup[str(topic_id)] = summary
    return lookup


def _confidence_label(confidence: float | int | None) -> str:
    if confidence is None:
        return ""
    try:
        return f"{round(float(confidence) * 100)}%"
    except (TypeError, ValueError):
        return ""


def render_summary_template(
    *,
    capture: dict[str, Any],
    recording_context: dict[str, Any],
    extraction: dict[str, Any],
    structured_topics: list[dict[str, Any]] | None = None,
) -> str:
    """Deterministic Markdown summary from extraction + optional topic summaries."""
    lines: list[str] = []
    title = str(capture.get("title") or extraction.get("title") or "Capture summary").strip()
    lines.append(f"# {title}")
    lines.append("")

    meta: list[str] = []
    brief = str(capture.get("brief") or recording_context.get("brief") or "").strip()
    if brief:
        meta.append(f"- **Brief:** {brief}")
    participants = str(
        capture.get("participants_hint") or extraction.get("participants_hint") or ""
    ).strip()
    if participants:
        meta.append(f"- **Participants:** {participants}")

    classification = recording_context.get("classification")
    if isinstance(classification, dict):
        mode = str(classification.get("recording_mode") or recording_context.get("recording_mode") or "")
        audience = str(classification.get("audience") or recording_context.get("audience") or "unknown")
        confidence = _confidence_label(classification.get("confidence"))
        if mode:
            detail = f"**Recording mode:** {mode} · **Audience:** {audience}"
            if confidence:
                detail += f" · **Confidence:** {confidence}"
            meta.append(f"- {detail}")

    if meta:
        lines.extend(meta)
        lines.append("")

    topic_summaries = _topic_summary_by_id(structured_topics)
    extraction_topics = extraction.get("topics") if isinstance(extraction.get("topics"), list) else []

    for topic in extraction_topics:
        if not isinstance(topic, dict):
            continue
        topic_title = str(topic.get("title") or "Topic").strip()
        lines.append(f"## {topic_title}")

        topic_id = str(topic.get("topic_id") or "")
        outline = topic_summaries.get(topic_id, "").strip()
        if outline:
            lines.append(outline)
            lines.append("")

        key_points = [str(p).strip() for p in (topic.get("key_points") or []) if str(p).strip()]
        if key_points:
            lines.append("### Key points")
            for point in key_points:
                lines.append(f"- {point}")
            lines.append("")

        action_items = [str(p).strip() for p in (topic.get("action_items") or []) if str(p).strip()]
        if action_items:
            lines.append("### Action items")
            for item in action_items:
                lines.append(f"- {item}")
            lines.append("")

        open_questions = [str(p).strip() for p in (topic.get("open_questions") or []) if str(p).strip()]
        if open_questions:
            lines.append("### Open questions")
            for question in open_questions:
                lines.append(f"- {question}")
            lines.append("")

    return "\n".join(lines).strip() + "\n"


def llm_synthesize_summary(
    *,
    capture: dict[str, Any],
    recording_context: dict[str, Any],
    extraction: dict[str, Any],
    structured_topics: list[dict[str, Any]] | None,
    synthesize_cfg: dict[str, Any],
    model_params: dict[str, Any],
    temperature: float,
) -> str:
    llm_cfg = synthesize_cfg.get("llm") if isinstance(synthesize_cfg.get("llm"), dict) else {}
    classification = recording_context.get("classification")
    recording_mode = ""
    audience = str(recording_context.get("audience") or capture.get("audience") or "unknown")
    if isinstance(classification, dict):
        recording_mode = str(classification.get("recording_mode") or "")
        audience = str(classification.get("audience") or audience)

    topics_payload = structured_topics or []
    if not topics_payload:
        topics_payload = [
            {"topic_id": t.get("topic_id"), "title": t.get("title")}
            for t in (extraction.get("topics") or [])
            if isinstance(t, dict)
        ]

    return chat_text(
        model_params,
        system_prompt=str(llm_cfg.get("system_prompt") or ""),
        user_prompt=apply_prompt_template(
            str(llm_cfg.get("user_prompt_template") or ""),
            {
                "title": str(capture.get("title") or ""),
                "brief": str(capture.get("brief") or ""),
                "participants_hint": str(capture.get("participants_hint") or ""),
                "recording_mode": recording_mode,
                "audience": audience,
                "extractions_json": json.dumps(extraction, ensure_ascii=False, indent=2),
                "topics_json": json.dumps(topics_payload, ensure_ascii=False, indent=2),
            },
        ),
        temperature=temperature,
    ).strip() + "\n"


def synthesize_summary(
    *,
    capture: dict[str, Any],
    recording_context: dict[str, Any],
    extraction: dict[str, Any],
    structured_topics: list[dict[str, Any]] | None,
    synthesize_cfg: dict[str, Any] | None,
    model_params: dict[str, Any] | None,
    temperature: float,
) -> str:
    cfg = synthesize_cfg or {}
    mode = str(cfg.get("mode") or "llm").strip().lower()
    if mode == "llm":
        if not model_params:
            raise RuntimeError("synthesize_summary.mode=llm requires model_name")
        return llm_synthesize_summary(
            capture=capture,
            recording_context=recording_context,
            extraction=extraction,
            structured_topics=structured_topics,
            synthesize_cfg=cfg,
            model_params=model_params,
            temperature=temperature,
        )
    return render_summary_template(
        capture=capture,
        recording_context=recording_context,
        extraction=extraction,
        structured_topics=structured_topics,
    )
