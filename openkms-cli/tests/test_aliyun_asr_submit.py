"""Tests for DashScope ASR submit payload."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from openkms_cli.providers.aliyun.asr import submit_file_transcription


def _mock_post_response(task_id: str = "task-123") -> MagicMock:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"output": {"task_id": task_id}}
    return response


def test_submit_qwen_uses_diarization_enabled():
    with patch(
        "openkms_cli.providers.aliyun.asr.requests.post",
        return_value=_mock_post_response(),
    ) as post:
        submit_file_transcription(
            file_url="https://example.com/audio.m4a",
            api_key="sk-test",
            base_url="https://dashscope.aliyuncs.com/api/v1",
            model="qwen-audio-3.0-asr-flash-filetrans",
            enable_diarization=True,
            context_prompt="Meeting about budgets",
        )

    payload = post.call_args.kwargs["json"]
    assert payload["model"] == "qwen-audio-3.0-asr-flash-filetrans"
    assert payload["parameters"]["diarization_enabled"] is True
    assert payload["parameters"]["prompt"] == "Meeting about budgets"
    assert "enable_diarization" not in payload["parameters"]


def test_submit_fun_asr_payload():
    with patch(
        "openkms_cli.providers.aliyun.asr.requests.post",
        return_value=_mock_post_response(),
    ) as post:
        submit_file_transcription(
            file_url="https://example.com/audio.m4a",
            api_key="sk-test",
            base_url="https://dashscope.aliyuncs.com/api/v1",
            model="fun-asr",
            enable_diarization=True,
            context_prompt="ignored for fun-asr main",
            language_hints=["zh", "en"],
            speaker_count=3,
        )

    payload = post.call_args.kwargs["json"]
    assert payload["model"] == "fun-asr"
    assert payload["parameters"]["diarization_enabled"] is True
    assert payload["parameters"]["speaker_count"] == 3
    assert payload["parameters"]["language_hints"] == ["zh"]
    assert "prompt" not in payload["parameters"]


def test_submit_fun_asr_flash_accepts_prompt():
    with patch(
        "openkms_cli.providers.aliyun.asr.requests.post",
        return_value=_mock_post_response(),
    ) as post:
        submit_file_transcription(
            file_url="https://example.com/audio.m4a",
            api_key="sk-test",
            base_url="https://dashscope.aliyuncs.com/api/v1",
            model="fun-asr-flash-2026-06-15",
            context_prompt="Product planning meeting",
        )

    payload = post.call_args.kwargs["json"]
    assert payload["parameters"]["prompt"] == "Product planning meeting"
