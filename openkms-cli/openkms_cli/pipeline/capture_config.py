"""Resolve audio-capture-post-process worker config (rules + LLM prompts)."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

DEFAULT_FACET_KEYWORDS: dict[str, list[str]] = {
    "progress_status": ["进度", "status", "里程碑", "milestone"],
    "solution_design": ["方案", "设计", "solution", "architecture"],
    "commercial_terms": ["报价", "合同", "commercial", "预算"],
}

DEFAULT_RECORDING_MODES: list[str] = [
    "multi_party_discussion",
    "structured_interview",
    "presentation_qa",
    "site_field_capture",
    "solo_voice_note",
    "general",
]

DEFAULT_CONTENT_FACETS: list[str] = [
    "solution_design",
    "progress_status",
    "commercial_terms",
    "risk_issue",
    "decision_action",
    "general_discussion",
]

DEFAULT_CLASSIFY_LLM_SYSTEM = """You classify a meeting/audio capture for downstream knowledge extraction.
Pick exactly one recording_mode from the allowed list.
Respect the user-selected recording_mode hint when plausible.
For each topic, assign one or more content_facets from the allowed list.
Set needs_review=true when confidence < confidence_threshold."""

DEFAULT_CLASSIFY_LLM_USER = """Capture title: {title}
Brief: {brief}
Participants hint: {participants_hint}
User-selected recording_mode hint: {recording_mode_hint}
Audience metadata: {audience}
Confidence threshold: {confidence_threshold}

Allowed recording_mode values:
{recording_modes}

Allowed content_facets (multi-select per topic):
{content_facets}

Topics (summaries):
{topics_json}

Return JSON only:
{{
  "recording_mode": "...",
  "audience": "{audience}",
  "confidence": 0.0,
  "needs_review": false,
  "content_facets_by_topic": [
    {{"topic_id": "topic_01", "content_facets": ["general_discussion"]}}
  ]
}}"""

DEFAULT_SEGMENT_TOPICS_LLM_SYSTEM = """You segment a meeting transcript into coherent topics for knowledge extraction.
Each topic must use only turn_id values from the input.
Titles: concise (<= 12 words). Summaries: 1-2 sentences capturing the gist, not verbatim quotes.
Prefer fewer, broader topics over many tiny fragments."""

DEFAULT_SEGMENT_TOPICS_LLM_USER = """Capture: {title}
Brief: {brief}

Turn window ({window_index}/{window_count}):
{turns_json}

Return JSON only:
{{"topics":[{{"title":"...","summary":"...","turn_ids":["s0_t001"]}}]}}"""

DEFAULT_EXTRACT_LLM_SYSTEM = """You extract structured knowledge from one topic in a meeting/audio capture.
Write concise factual bullets — NEVER paste long verbatim transcript spans.
key_points: 3-6 distilled insights (decisions, facts, conclusions).
action_items: explicit commitments only; include owner if stated.
open_questions: unresolved questions explicitly raised.
Use the same language as the source (Chinese or English)."""

DEFAULT_EXTRACT_LLM_USER = """Capture: {title}
Recording mode: {recording_mode}
Audience: {audience}

Topic: {topic_title}
Topic summary: {topic_summary}
Relevant turns:
{turns_text}

Return JSON only:
{{
  "key_points": ["..."],
  "action_items": ["..."],
  "open_questions": ["..."]
}}"""

DEFAULT_SYNTHESIZE_LLM_SYSTEM = """You write a concise meeting summary document in Markdown for internal knowledge.
Use the same language as the source material (Chinese or English).
Structure: title (#), optional metadata bullets, short executive overview,
then ## sections per topic with clear narrative prose (not raw transcript quotes).
End with ## Action items and ## Open questions sections when applicable.
Do not invent facts beyond the provided extractions."""

DEFAULT_SYNTHESIZE_LLM_USER = """Capture title: {title}
Brief: {brief}
Participants: {participants_hint}
Recording mode: {recording_mode}
Audience: {audience}

Structured extractions (JSON):
{extractions_json}

Topic outlines (JSON):
{topics_json}

Write the full summary.md content only (Markdown, no code fences)."""

DEFAULTS: dict[str, Any] = {
    "enable_merge_turns": True,
    "segment_topics": {
        "enabled": True,
        "mode": "llm",
        "window_minutes": 12,
        "preview_max_chars": 160,
        "llm": {
            "system_prompt": DEFAULT_SEGMENT_TOPICS_LLM_SYSTEM,
            "user_prompt_template": DEFAULT_SEGMENT_TOPICS_LLM_USER,
        },
    },
    "chapters": {
        "enabled": True,
        "mode": "one_per_topic",
    },
    "classify": {
        "mode": "llm",
        "confidence_threshold": 0.7,
        "recording_modes": DEFAULT_RECORDING_MODES,
        "content_facets": DEFAULT_CONTENT_FACETS,
        "facet_keywords": DEFAULT_FACET_KEYWORDS,
        "default_facet": "general_discussion",
        "speaker_count_rules": {
            "solo_voice_note_max_speakers": 1,
            "multi_party_min_speakers": 4,
        },
        "confidence_by_hint": 0.85,
        "confidence_solo": 0.75,
        "confidence_multi_party": 0.7,
        "confidence_general": 0.55,
        "llm": {
            "system_prompt": DEFAULT_CLASSIFY_LLM_SYSTEM,
            "user_prompt_template": DEFAULT_CLASSIFY_LLM_USER,
        },
    },
    "extract": {
        "mode": "llm",
        "key_point_max_chars": 280,
        "llm": {
            "system_prompt": DEFAULT_EXTRACT_LLM_SYSTEM,
            "user_prompt_template": DEFAULT_EXTRACT_LLM_USER,
        },
    },
    "synthesize_summary": {
        "enabled": True,
        "mode": "llm",
        "llm": {
            "system_prompt": DEFAULT_SYNTHESIZE_LLM_SYSTEM,
            "user_prompt_template": DEFAULT_SYNTHESIZE_LLM_USER,
        },
    },
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _coerce_post_process(raw: dict[str, Any]) -> dict[str, Any]:
    """Map legacy boolean flags to nested step config."""
    merged = _deep_merge(DEFAULTS, raw)

    if "enable_segment_topics" in raw:
        merged["segment_topics"]["enabled"] = bool(raw.get("enable_segment_topics"))
    if "enable_chapters" in raw:
        merged["chapters"]["enabled"] = bool(raw.get("enable_chapters"))
    if raw.get("enable_llm_structure") is True:
        for step in ("segment_topics", "classify", "extract", "synthesize_summary"):
            if step in merged and isinstance(merged[step], dict):
                if str(merged[step].get("mode") or "llm") == "rules":
                    merged[step]["mode"] = "llm"

    return merged


def resolve_post_process_config(workflow: dict[str, Any]) -> dict[str, Any]:
    post = workflow.get("post_process")
    if not isinstance(post, dict):
        post = {}
    return _coerce_post_process(post)


def workflow_temperature(workflow: dict[str, Any], *, default: float = 0.2) -> float:
    try:
        value = workflow.get("temperature")
        if value is None:
            return default
        temp = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(temp, 2.0))


def apply_prompt_template(template: str, variables: dict[str, str]) -> str:
    out = template
    for key, value in variables.items():
        out = out.replace(f"{{{key}}}", value)
    return out
