import pytest

from openkms_cli.core.chat_completions import (
    apply_chat_provider_body_defaults,
    chat_completions_url,
    should_disable_thinking,
)


def test_chat_completions_url_dashscope_api_v1_rewrites_compatible_mode():
    assert (
        chat_completions_url("https://dashscope.aliyuncs.com/api/v1")
        == "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    )


def test_chat_completions_url_appends_v1():
    assert (
        chat_completions_url("https://api.siliconflow.cn")
        == "https://api.siliconflow.cn/v1/chat/completions"
    )


def test_chat_completions_url_with_v1_suffix():
    assert (
        chat_completions_url("https://dashscope.aliyuncs.com/compatible-mode/v1")
        == "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    )


def test_chat_completions_url_zhipu_v4():
    assert (
        chat_completions_url("https://open.bigmodel.cn/api/paas/v4")
        == "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    )


def test_chat_completions_url_empty_raises():
    with pytest.raises(RuntimeError, match="base_url is empty"):
        chat_completions_url("")


def test_should_disable_thinking_for_qwen_dashscope():
    assert should_disable_thinking(
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "qwen3.7-plus",
    )


def test_apply_chat_provider_body_defaults_qwen():
    body = apply_chat_provider_body_defaults(
        {"model": "qwen3.7-plus", "messages": []},
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model_name="qwen3.7-plus",
    )
    assert body["enable_thinking"] is False
