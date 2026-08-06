"""Resolve platform model credentials via internal-api cli-params."""

from __future__ import annotations

from typing import Any

import requests

from .settings import CliSettings

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
