"""Tests for platform model credential resolution."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from openkms_cli.core.model_resolve import ModelResolveError, resolve_metadata_models_for_job
from openkms_cli.core.workflow_config import load_packaged_default


def test_resolve_metadata_models_ignores_parse_vlm_model_name() -> None:
    cfg = load_packaged_default("paddleocr-doc-parse")
    calls: list[tuple[str, str | None]] = []

    def fake_fetch(_settings, *, model_name: str, api_type: str | None = None):
        calls.append((model_name, api_type))
        if model_name == "deepSeek-V4-Flash" and api_type == "chat-completions":
            return {
                "model_name": "deepseek-chat",
                "base_url": "https://example.com/v1",
                "api_key": "test-key",
            }
        return None

    with patch("openkms_cli.core.model_resolve.fetch_cli_model_params", side_effect=fake_fetch):
        resolved = resolve_metadata_models_for_job(cfg)

    assert set(resolved) == {"deepSeek-V4-Flash"}
    assert calls == [("deepSeek-V4-Flash", "chat-completions")]


def test_resolve_metadata_models_requires_metadata_model_name() -> None:
    with pytest.raises(ModelResolveError, match="metadata_extract.model_name"):
        resolve_metadata_models_for_job({"metadata_extract": {"enabled": True}})
