"""Provider-specific embedding API capabilities."""

from typing import Any


def embedding_supports_dimensions(model_config: dict[str, Any]) -> bool:
    explicit = model_config.get("supports_dimensions")
    if explicit is True:
        return True
    if explicit is False:
        return False

    model = str(model_config.get("model_name") or "").lower()
    base = str(model_config.get("base_url") or "").lower()

    is_ali = (
        "dashscope" in base
        or "aliyuncs.com" in base
        or "maas.aliyuncs.com" in base
    )
    if is_ali:
        if "text-embedding-v3" in model or "text-embedding-v4" in model:
            return True
        if "qwen" in model and "embedding" in model:
            return True
        if "tongyi-embedding" in model:
            return True
        return False

    if "openai.com" in base and "text-embedding-3" in model:
        return True

    return False
