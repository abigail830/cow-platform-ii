"""Tests for ASR workflow model resolution."""

from __future__ import annotations

from unittest.mock import patch

from openkms_cli.providers.aliyun.asr_config import resolve_asr_from_workflow


def test_resolve_asr_from_workflow_uses_cli_params():
    workflow = {"model_name": "qwen-audio-3.0-asr-flash-filetrans", "asr": {"enable_diarization": True}}
    fake_params = {
        "api_key": "sk-test",
        "base_url": "https://dashscope.aliyuncs.com/api/v1",
        "model_name": "qwen-audio-3.0-asr-flash-filetrans",
    }
    with patch(
        "openkms_cli.providers.aliyun.asr_config.fetch_cli_model_params",
        return_value=fake_params,
    ):
        runtime = resolve_asr_from_workflow(workflow)
    assert runtime.display_name == "qwen-audio-3.0-asr-flash-filetrans"
    assert runtime.model == "qwen-audio-3.0-asr-flash-filetrans"
    assert runtime.api_key == "sk-test"


def test_resolve_asr_accepts_nested_model_name():
    workflow = {"asr": {"model_name": "qwen-audio-3.0-asr-flash-filetrans"}}
    fake_params = {
        "api_key": "sk-test",
        "base_url": "https://dashscope.aliyuncs.com/api/v1",
        "model_name": "qwen-audio-3.0-asr-flash-filetrans",
    }
    with patch(
        "openkms_cli.providers.aliyun.asr_config.fetch_cli_model_params",
        return_value=fake_params,
    ):
        runtime = resolve_asr_from_workflow(workflow)
    assert runtime.display_name == "qwen-audio-3.0-asr-flash-filetrans"
