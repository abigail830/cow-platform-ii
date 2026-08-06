"""Resolve platform VLM credentials for paddleocr-doc-parse from workflow YAML."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from openkms_cli.core.cli_params import fetch_cli_model_params
from openkms_cli.core.settings import CliSettings, get_cli_settings


@dataclass(frozen=True)
class VlmRuntimeConfig:
    base_url: str
    model_name: str
    api_key: str | None
    max_concurrency: int = 3


def _read_max_concurrency(data: dict[str, Any]) -> int:
    raw = data.get("max_concurrency")
    if raw is None:
        extra = data.get("extra_config")
        if isinstance(extra, dict):
            raw = extra.get("max_concurrency") or extra.get("maxConcurrency")
    try:
        return int(raw) if raw is not None else 3
    except (TypeError, ValueError):
        return 3


def resolve_vlm_from_workflow(
    config: dict[str, Any],
    *,
    cfg: CliSettings | None = None,
) -> VlmRuntimeConfig:
    """YAML top-level ``model_name`` → cli-params (api_type=vlm)."""
    settings = cfg or get_cli_settings()
    display_name = str(config.get("model_name") or "").strip()
    if not display_name:
        raise ValueError(
            "paddleocr-doc-parse workflow must set model_name "
            "(Models list bold name for a VLM model)"
        )
    data = fetch_cli_model_params(
        settings,
        model_name=display_name,
        api_type="vlm",
    )
    if not data:
        raise ValueError(
            f"Failed to resolve VLM model {display_name!r} via cli-params. "
            "Check Admin → Models and CLI API auth."
        )
    base_url = str(data.get("base_url") or "").strip()
    model_name = str(data.get("model_name") or "").strip()
    if not base_url:
        raise ValueError(f"VLM model {display_name!r} has no base_url in platform config")
    if not model_name:
        raise ValueError(f"VLM model {display_name!r} has no provider model id")
    api_key = str(data.get("api_key") or "").strip() or None
    return VlmRuntimeConfig(
        base_url=base_url,
        model_name=model_name,
        api_key=api_key,
        max_concurrency=_read_max_concurrency(data),
    )
