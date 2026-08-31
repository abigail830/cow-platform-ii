"""Resolve platform model credentials once per job (by Models list bold name)."""

from __future__ import annotations

from typing import Any

from openkms_cli.core.chat_completions import VISION_CHAT_API_TYPES
from openkms_cli.core.cli_params import fetch_cli_model_params
from openkms_cli.core.settings import CliSettings, get_cli_settings
from openkms_cli.core.workflow_config import collect_model_names


class ModelResolveError(RuntimeError):
    pass


def resolve_models_for_job(
    config: dict[str, Any],
    *,
    cfg: CliSettings | None = None,
    api_type: str | None = "chat-completions",
) -> dict[str, dict[str, Any]]:
    """Map YAML model_name → cli-params payload. One HTTP call per distinct name."""
    settings = cfg or get_cli_settings()
    names = collect_model_names(config)
    out: dict[str, dict[str, Any]] = {}
    for name in names:
        data = fetch_cli_model_params(
            settings,
            model_name=name,
            api_type=api_type,
        )
        if not data:
            raise ModelResolveError(
                f"Failed to resolve model credentials for model_name={name!r} via cli-params. "
                "Check Admin → Models for that bold name and CLI API auth."
            )
        out[name] = data
    return out


def resolve_model_params_by_name(
    model_name: str,
    *,
    cfg: CliSettings | None = None,
    api_types: tuple[str, ...] = VISION_CHAT_API_TYPES,
) -> dict[str, Any]:
    """Resolve one Models-list name; try vision-capable api types, then any api type."""
    settings = cfg or get_cli_settings()
    name = (model_name or "").strip()
    if not name:
        raise ModelResolveError("model_name is required")

    for api_type in api_types:
        data = fetch_cli_model_params(settings, model_name=name, api_type=api_type)
        if data:
            return data

    data = fetch_cli_model_params(settings, model_name=name, api_type=None)
    if data:
        return data

    tried = ", ".join(api_types) if api_types else "(none)"
    raise ModelResolveError(
        f"Failed to resolve model {name!r} via cli-params (tried api types: {tried}). "
        "Check Admin → Models: bold name, api_type, base_url, and provider model id."
    )


def resolve_metadata_models_for_job(
    config: dict[str, Any],
    *,
    cfg: CliSettings | None = None,
) -> dict[str, dict[str, Any]]:
    """Resolve only metadata_extract.model_name (chat-completions), not parse/VLM models."""
    from openkms_cli.core.workflow_config import metadata_extract_section

    meta = metadata_extract_section(config) or {}
    model_name = str(meta.get("model_name") or "").strip()
    if not model_name:
        raise ModelResolveError("metadata_extract.model_name is required when metadata extraction is enabled")
    return resolve_models_for_job(
        {"metadata_extract": {"model_name": model_name}},
        cfg=cfg,
        api_type="chat-completions",
    )


def model_connection(params: dict[str, Any]) -> dict[str, Any]:
    """Shape expected by extract_metadata_sync / chat clients."""
    return {
        "base_url": params.get("base_url"),
        "api_key": params.get("api_key"),
        "model_name": params.get("model_name"),
    }
