"""OpenAI-compatible chat/completions helpers (shared by CLI workers)."""

from __future__ import annotations

import re
from typing import Any

import requests

VISION_CHAT_API_TYPES: tuple[str, ...] = ("chat-completions", "vlm")


def normalize_chat_base_url(base_url: str) -> str:
    """Adjust provider base_url before appending /chat/completions.

    Model config may store DashScope native ``/api/v1`` (used by ASR SDK paths).
    OpenAI-compatible multimodal chat requires ``/compatible-mode/v1``.
    """
    base = (base_url or "").strip().rstrip("/")
    if not base:
        return base
    if re.search(r"dashscope(?:-intl|-us)?\.aliyuncs\.com/api/v1$", base, re.I):
        return re.sub(r"/api/v1$", "/compatible-mode/v1", base, flags=re.I)
    if re.search(r"\.maas\.aliyuncs\.com/api/v1$", base, re.I):
        return re.sub(r"/api/v1$", "/compatible-mode/v1", base, flags=re.I)
    return base


def chat_completions_url(base_url: str) -> str:
    """Match backend model-chat-completions.chatCompletionsUrl."""
    base = normalize_chat_base_url(base_url)
    if not base:
        raise RuntimeError("Model base_url is empty; set a provider URL in Admin → Models")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    if re.search(r"/v\d+$", base, re.I):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def should_disable_thinking(base_url: str, model_name: str) -> bool:
    base = (base_url or "").lower()
    model = (model_name or "").lower()
    if "siliconflow" in base:
        return True
    if "dashscope" in base or "aliyuncs.com" in base:
        return True
    if "qwen3" in model:
        return True
    return False


def apply_chat_provider_body_defaults(
    body: dict[str, Any],
    *,
    base_url: str,
    model_name: str,
) -> dict[str, Any]:
    """Provider-specific fields (e.g. DashScope/Qwen enable_thinking=false)."""
    if should_disable_thinking(base_url, model_name):
        body["enable_thinking"] = False
    return body


def post_chat_completions(
    params: dict[str, Any],
    body: dict[str, Any],
    *,
    timeout_seconds: int,
    error_prefix: str = "chat",
) -> dict[str, Any]:
    base_url = str(params.get("base_url") or "").strip()
    api_key = str(params.get("api_key") or "").strip()
    model_name = str(params.get("model_name") or "").strip()
    if not api_key:
        raise RuntimeError(f"{error_prefix}: model has no api_key in platform config")
    if not model_name:
        raise RuntimeError(f"{error_prefix}: model has no provider model id")

    url = chat_completions_url(base_url)
    payload = apply_chat_provider_body_defaults(
        dict(body),
        base_url=base_url,
        model_name=model_name,
    )
    resp = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json=payload,
        timeout=timeout_seconds,
    )
    if not resp.ok:
        detail = (resp.text or "").strip()[:300]
        raise RuntimeError(f"{error_prefix} {resp.status_code} url={url}: {detail}")
    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError(f"{error_prefix}: response is not a JSON object")
    return data
