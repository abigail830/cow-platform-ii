from openkms_cli.pipeline.capture_config import apply_prompt_template, resolve_post_process_config
from openkms_cli.pipeline.capture_structure import classify_capture


def test_resolve_post_process_config_defaults_to_llm():
    cfg = resolve_post_process_config({})
    assert cfg["segment_topics"]["mode"] == "llm"
    assert cfg["classify"]["mode"] == "llm"
    assert cfg["extract"]["mode"] == "llm"


def test_resolve_post_process_config_merges_defaults():
    cfg = resolve_post_process_config({})
    assert cfg["segment_topics"]["window_minutes"] == 12
    assert cfg["classify"]["facet_keywords"]["solution_design"]
    assert cfg["extract"]["key_point_max_chars"] == 280


def test_enable_llm_structure_promotes_step_modes():
    cfg = resolve_post_process_config({"post_process": {"enable_llm_structure": True}})
    assert cfg["segment_topics"]["mode"] == "llm"
    assert cfg["classify"]["mode"] == "llm"
    assert cfg["extract"]["mode"] == "llm"


def test_classify_uses_custom_facet_keywords():
    turns = [{"turn_id": "s0_t001", "speaker": "A", "text": "预算讨论"}]
    topics = [{"topic_id": "topic_01", "title": "预算讨论", "summary": "预算讨论"}]
    result = classify_capture(
        recording_mode_hint=None,
        audience="internal_team",
        turns=turns,
        topics=topics,
        classify_cfg={
            "facet_keywords": {"commercial_terms": ["预算"]},
            "default_facet": "general_discussion",
            "speaker_count_rules": {"solo_voice_note_max_speakers": 1, "multi_party_min_speakers": 4},
        },
    )
    assert result["content_facets_by_topic"][0]["content_facets"] == ["commercial_terms"]


def test_apply_prompt_template_replaces_variables():
    rendered = apply_prompt_template("Hello {name}", {"name": "world"})
    assert rendered == "Hello world"
