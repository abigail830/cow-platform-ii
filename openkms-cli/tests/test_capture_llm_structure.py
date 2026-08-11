from unittest.mock import patch

from openkms_cli.pipeline.capture_structure import llm_extract_knowledge


def test_llm_extract_knowledge_uses_model_output():
    topics = [
        {
            "topic_id": "topic_01",
            "title": "Architecture review",
            "summary": "Team discussed API design",
            "turn_ids": ["s0_t001"],
        }
    ]
    turns = [{"turn_id": "s0_t001", "speaker": "A", "text": "We agreed on REST endpoints."}]

    with patch(
        "openkms_cli.pipeline.capture_structure.chat_json",
        return_value={
            "key_points": ["Agreed on REST endpoints"],
            "action_items": ["Draft OpenAPI spec"],
            "open_questions": [],
        },
    ) as chat_mock:
        result = llm_extract_knowledge(
            capture={"id": "cap1", "title": "Weekly sync"},
            classification={"recording_mode": "multi_party_discussion", "audience": "internal_team"},
            topics=topics,
            turns=turns,
            extract_cfg={
                "llm": {
                    "system_prompt": "sys",
                    "user_prompt_template": "topic {topic_title}\n{turns_text}",
                }
            },
            model_params={"model_name": "test", "api_key": "k", "base_url": "http://x/v1"},
            temperature=0.2,
        )

    assert chat_mock.called
    assert result["topics"][0]["key_points"] == ["Agreed on REST endpoints"]
    assert result["topics"][0]["action_items"] == ["Draft OpenAPI spec"]
    assert "REST endpoints" in chat_mock.call_args.kwargs["user_prompt"]
