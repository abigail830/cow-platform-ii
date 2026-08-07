"""Resolve ASR model credentials from workflow YAML + platform cli-params."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from openkms_cli.core.cli_params import fetch_cli_model_params
from openkms_cli.core.settings import CliSettings, get_cli_settings


class AsrConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class AsrRuntimeConfig:
    api_key: str
    base_url: str
    model: str
    display_name: str


def workflow_asr_model_name(config: dict[str, Any]) -> str:
    top = str(config.get("model_name") or "").strip()
    if top:
        return top
    asr = config.get("asr")
    if isinstance(asr, dict):
        nested = str(asr.get("model_name") or "").strip()
        if nested:
            return nested
    return ""


def resolve_asr_from_workflow(
    config: dict[str, Any],
    *,
    cfg: CliSettings | None = None,
) -> AsrRuntimeConfig:
    """YAML model_name → cli-params (api_type=audio-asr)."""
    settings = cfg or get_cli_settings()
    display_name = workflow_asr_model_name(config)
    if not display_name:
        raise AsrConfigError(
            "aliyun-qwen-audio-transcribe workflow must set model_name "
            "(Models list bold name, api_type=audio-asr)."
        )

    data = fetch_cli_model_params(settings, model_name=display_name, api_type="audio-asr")
    if not data:
        raise AsrConfigError(
            f"Failed to resolve ASR model {display_name!r} via cli-params. "
            "Add an Admin → Models entry (api type Audio ASR) with that bold name."
        )

    api_key = str(data.get("api_key") or "").strip()
    base_url = str(data.get("base_url") or "").strip()
    model = str(data.get("model_name") or "").strip()
    if not api_key:
        raise AsrConfigError(f"ASR model {display_name!r} has no API key configured")
    if not base_url:
        raise AsrConfigError(f"ASR model {display_name!r} has no base URL configured")
    if not model:
        raise AsrConfigError(f"ASR model {display_name!r} has no provider model id configured")

    return AsrRuntimeConfig(
        api_key=api_key,
        base_url=base_url,
        model=model,
        display_name=display_name,
    )
