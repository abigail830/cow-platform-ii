from unittest.mock import patch

from openkms_cli.core.model_resolve import resolve_model_params_by_name


def test_resolve_model_params_by_name_tries_vlm_after_chat_completions():
    calls: list[str | None] = []

    def fake_fetch(_cfg, *, model_name, api_type=None):
        calls.append(api_type)
        if api_type == "vlm":
            return {
                "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "model_name": "qwen-plus",
                "api_key": "sk-test",
            }
        return None

    with patch("openkms_cli.core.model_resolve.fetch_cli_model_params", side_effect=fake_fetch):
        params = resolve_model_params_by_name("qwen3.7-plus")

    assert calls == ["chat-completions", "vlm"]
    assert params["model_name"] == "qwen-plus"
