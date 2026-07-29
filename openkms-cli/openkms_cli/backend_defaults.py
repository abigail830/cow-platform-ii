"""Resolve VLM runtime settings for PaddleOCR-VL (direct CLI/env or optional backend lookup)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import requests

from .settings import CliSettings

_INTERNAL_DOCUMENT_PARSE_DEFAULTS = "/internal-api/models/document-parse-defaults"


@dataclass(frozen=True)
class VlmRuntimeConfig:
    """Connection settings passed to PaddleOCR-VL (mlx-vlm-server API)."""

    base_url: str
    model_name: str
    api_key: str | None
    max_concurrency: int = 3


def _merge_document_parse_defaults_payload(
    url: str,
    model: str,
    api_key: str | None,
    *,
    need_url: bool,
    need_model: bool,
    need_key: bool,
    model_name_param: str | None,
    data: dict[str, Any],
) -> tuple[str, str, str | None]:
    """Apply JSON from document-parse-defaults into current url/model/api_key (testable pure merge)."""
    if need_url:
        u = (data.get("base_url") or "").strip()
        if u:
            url = u
    if need_key:
        k = (data.get("api_key") or "").strip()
        if k:
            api_key = k
    resolved_m = (data.get("model_name") or "").strip()
    if need_model or model_name_param is not None:
        if resolved_m:
            model = resolved_m
    return url, model, api_key


def _fetch_document_parse_defaults(
    cfg: CliSettings, model_name_query: str | None
) -> dict[str, Any] | None:
    """GET /internal-api/models/document-parse-defaults with CLI auth (Basic or Bearer)."""
    from .auth import try_api_request_auth

    api = (cfg.openkms_api_url or "").strip()
    if not api:
        return None
    cred = try_api_request_auth()
    if not cred:
        return None
    headers, basic = cred
    params: dict[str, str] = {}
    if model_name_query and model_name_query.strip():
        params["model_name"] = model_name_query.strip()
    try:
        r = requests.get(
            f"{api.rstrip('/')}{_INTERNAL_DOCUMENT_PARSE_DEFAULTS}",
            headers=headers,
            auth=basic,
            params=params or None,
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


_INTERNAL_CLI_PARAMS = "/internal-api/models/cli-params"


def fetch_cli_model_params(
    cfg: CliSettings,
    *,
    model_id: str | None = None,
    model_name: str | None = None,
    api_type: str | None = None,
) -> dict[str, Any] | None:
    """GET /internal-api/models/cli-params with CLI auth (Basic or Bearer)."""
    from .auth import try_api_request_auth

    api = (cfg.openkms_api_url or "").strip()
    if not api:
        return None
    cred = try_api_request_auth()
    if not cred:
        return None
    headers, basic = cred
    params: dict[str, str] = {}
    if model_id and model_id.strip():
        params["model_id"] = model_id.strip()
    if model_name and model_name.strip():
        params["model_name"] = model_name.strip()
    if api_type and api_type.strip():
        params["api_type"] = api_type.strip()
    if not params.get("model_id") and not params.get("model_name"):
        return None
    try:
        r = requests.get(
            f"{api.rstrip('/')}{_INTERNAL_CLI_PARAMS}",
            headers=headers,
            auth=basic,
            params=params,
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def _lookup_name_from_sources(
    cfg: CliSettings,
    *,
    cli_config_lookup_name: str | None,
    file_config: dict[str, Any] | None,
) -> str | None:
    """Display name used to fetch model connection info from the backend (optional)."""
    for candidate in (
        cli_config_lookup_name,
        (file_config or {}).get("vlm_config_name"),
        (cfg.vlm_config_name or "").strip() or None,
    ):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    # Legacy: OPENKMS_VLM_MODEL env as lookup key when URL or API key still missing from env.
    if (cfg.openkms_api_url or "").strip() and "OPENKMS_VLM_MODEL" in os.environ:
        need_url = "OPENKMS_VLM_URL" not in os.environ
        need_key = "OPENKMS_VLM_API_KEY" not in os.environ and not (cfg.vlm_api_key or "").strip()
        if need_url or need_key:
            legacy = os.environ["OPENKMS_VLM_MODEL"].strip()
            if legacy:
                return legacy
    return None


def resolve_vlm_config(
    cfg: CliSettings,
    *,
    cli_vlm_url: str | None = None,
    cli_model: str | None = None,
    cli_vlm_api_key: str | None = None,
    cli_max_concurrency: int | None = None,
    cli_config_lookup_name: str | None = None,
    file_config: dict[str, Any] | None = None,
) -> VlmRuntimeConfig:
    """
    Build effective VLM settings for paddleocr-doc-parse.

    Priority per field: CLI flag > JSON file > environment (via CliSettings) > hardcoded default.

    Backend lookup (GET document-parse-defaults) runs only when a config display name is provided
    via --vlm-config-name, OPENKMS_VLM_CONFIG_NAME, JSON ``vlm_config_name``, or the legacy
    OPENKMS_VLM_MODEL env when URL/key are still missing. It is skipped when the caller passes
    both --vlm-url and --model on the CLI (fully standalone mode).
    """
    url = (cfg.vlm_url or "").strip() or "http://localhost:8101/"
    model = (cfg.vlm_model or "").strip() or "PaddlePaddle/PaddleOCR-VL-1.5"
    api_key: str | None = (cfg.vlm_api_key or "").strip() or None
    max_concurrency = cfg.vlm_max_concurrency

    if file_config:
        if file_config.get("vlm_url"):
            url = str(file_config["vlm_url"]).strip() or url
        if file_config.get("model"):
            model = str(file_config["model"]).strip() or model
        if file_config.get("vlm_api_key"):
            api_key = str(file_config["vlm_api_key"]).strip() or api_key
        if file_config.get("max_concurrency") is not None:
            max_concurrency = int(file_config["max_concurrency"])

    cli_set_url = cli_vlm_url is not None
    cli_set_model = cli_model is not None
    cli_set_key = cli_vlm_api_key is not None
    cli_set_concurrency = cli_max_concurrency is not None

    if cli_set_url:
        url = cli_vlm_url.strip() or url
    if cli_set_model:
        model = cli_model.strip() or model
    if cli_set_key:
        api_key = cli_vlm_api_key.strip() or None
    if cli_set_concurrency:
        max_concurrency = cli_max_concurrency

    standalone_cli = cli_set_url and cli_set_model
    lookup_name = None if standalone_cli else _lookup_name_from_sources(
        cfg,
        cli_config_lookup_name=cli_config_lookup_name,
        file_config=file_config,
    )

    if lookup_name:
        data = _fetch_document_parse_defaults(cfg, lookup_name)
        if data:
            need_url = not cli_set_url and "OPENKMS_VLM_URL" not in os.environ
            need_model = not cli_set_model and "OPENKMS_VLM_MODEL" not in os.environ
            need_key = (
                not cli_set_key
                and "OPENKMS_VLM_API_KEY" not in os.environ
                and not api_key
            )
            url, model, api_key = _merge_document_parse_defaults_payload(
                url,
                model,
                api_key,
                need_url=need_url,
                need_model=need_model,
                need_key=need_key,
                model_name_param=lookup_name,
                data=data,
            )
            mc = data.get("max_concurrency")
            if mc is not None and not cli_set_concurrency:
                try:
                    max_concurrency = int(mc)
                except (TypeError, ValueError):
                    pass

    return VlmRuntimeConfig(
        base_url=url,
        model_name=model,
        api_key=api_key,
        max_concurrency=max_concurrency,
    )


def resolve_vlm_for_cli(cfg: CliSettings) -> tuple[str, str, str | None]:
    """Backward-compatible tuple API; prefer :func:`resolve_vlm_config`."""
    resolved = resolve_vlm_config(cfg)
    return resolved.base_url, resolved.model_name, resolved.api_key
