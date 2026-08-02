"""Embedding generation for RAG indexing."""
import base64
import struct
from typing import Any

from openkms_cli.kb.embedding_provider import embedding_supports_dimensions


def generate_embeddings(
    texts: list[str],
    model_config: dict[str, Any],
    *,
    dimensions: int | None = None,
) -> list[str]:
    """Generate embeddings via OpenAI-compatible API. Returns base64-encoded vectors."""
    from openai import OpenAI

    base_url = model_config["base_url"].rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = OpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    batch_size = 32
    all_embeddings: list[str] = []
    supports_dimensions = embedding_supports_dimensions(model_config)
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        kwargs: dict[str, Any] = {
            "model": model_config.get("model_name", "text-embedding-ada-002"),
            "input": batch,
            "encoding_format": "base64",
        }
        if dimensions is not None and supports_dimensions:
            kwargs["dimensions"] = dimensions
        try:
            response = client.embeddings.create(**kwargs)
        except Exception:
            # DashScope and some providers only accept float vectors.
            if kwargs.get("encoding_format") == "base64":
                kwargs.pop("encoding_format", None)
                response = client.embeddings.create(**kwargs)
            else:
                raise
        for item in response.data:
            emb = item.embedding
            if isinstance(emb, str):
                all_embeddings.append(emb)
            else:
                all_embeddings.append(
                    base64.b64encode(struct.pack(f"<{len(emb)}f", *emb)).decode("ascii")
                )
    return all_embeddings
