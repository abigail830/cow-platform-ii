"""Provider-specific embedding API capabilities."""

from typing import Any


def _is_aliyun_embedding_endpoint(model_config: dict[str, Any]) -> bool:
    base = str(model_config.get("base_url") or "").lower()
    return "dashscope" in base or "aliyuncs.com" in base or "maas.aliyuncs.com" in base


def embedding_supports_dimensions(model_config: dict[str, Any]) -> bool:
    explicit = model_config.get("supports_dimensions")
    if explicit is True:
        return True
    if explicit is False:
        return False

    model = str(model_config.get("model_name") or "").lower()
    base = str(model_config.get("base_url") or "").lower()

    if _is_aliyun_embedding_endpoint(model_config):
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


def embedding_batch_size(model_config: dict[str, Any]) -> int:
    """Max texts per embeddings API call (provider limits vary)."""
    explicit = model_config.get("embedding_batch_size")
    if isinstance(explicit, int) and explicit > 0:
        return explicit

    if _is_aliyun_embedding_endpoint(model_config):
        # DashScope / Bailian text-embedding-v3/v4: up to 10 texts per request.
        return 10

    return 32
