from openkms_cli.pipeline.capture_config import resolve_post_process_config
from openkms_cli.pipeline.capture_summarize import render_summary_template


def test_resolve_post_process_config_defaults_synthesize_summary_to_llm():
    cfg = resolve_post_process_config({})
    assert cfg["synthesize_summary"]["enabled"] is True
    assert cfg["synthesize_summary"]["mode"] == "llm"


def test_render_summary_template_includes_topic_outline_and_bullets():
    markdown = render_summary_template(
        capture={
            "title": "HK trip",
            "brief": "Field notes",
            "participants_hint": "Sara",
        },
        recording_context={
            "classification": {
                "recording_mode": "solo_voice_note",
                "audience": "internal_team",
                "confidence": 0.9,
            }
        },
        extraction={
            "topics": [
                {
                    "topic_id": "topic_01",
                    "title": "Itinerary",
                    "key_points": ["Visited three cooked food centres."],
                    "action_items": [],
                    "open_questions": [],
                }
            ]
        },
        structured_topics=[
            {
                "topic_id": "topic_01",
                "title": "Itinerary",
                "summary": "A three-day Hong Kong food centre tour.",
            }
        ],
    )

    assert markdown.startswith("# HK trip")
    assert "A three-day Hong Kong food centre tour." in markdown
    assert "### Key points" in markdown
    assert "Visited three cooked food centres." in markdown


def test_render_summary_template_can_disable_llm_via_mode_template():
    cfg = resolve_post_process_config(
        {"post_process": {"synthesize_summary": {"enabled": True, "mode": "template"}}}
    )
    assert cfg["synthesize_summary"]["mode"] == "template"
