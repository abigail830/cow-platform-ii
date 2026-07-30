"""Internal API client for async pipeline jobs."""

from __future__ import annotations

from typing import Any

import requests

from openkms_cli.core.auth import auth_expired_response, try_api_request_auth


class PipelineJobApiError(RuntimeError):
    """Raised when a pipeline job API call fails."""


def _auth() -> tuple[dict[str, str], tuple[str, str] | None]:
    cred = try_api_request_auth()
    if cred is None:
        raise PipelineJobApiError(
            "API authentication required (OPENKMS_AUTH_MODE + credentials)"
        )
    return cred


def _request(
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
    timeout: int = 120,
) -> dict[str, Any]:
    auth_headers, basic = _auth()
    headers = {**auth_headers}
    if json_body is not None:
        headers["Content-Type"] = "application/json"

    for attempt in range(2):
        resp = requests.request(
            method,
            url,
            json=json_body,
            headers=headers,
            auth=basic,
            timeout=timeout,
        )
        if resp.ok:
            if not resp.content:
                return {}
            data = resp.json()
            return data if isinstance(data, dict) else {}
        if attempt == 0 and auth_expired_response(resp):
            from openkms_cli.core.auth import try_api_request_auth as refresh

            cred = refresh()
            if cred is not None:
                auth_headers, basic = cred
                headers = {**auth_headers}
                if json_body is not None:
                    headers["Content-Type"] = "application/json"
                continue
        detail = (resp.text or "")[:500]
        raise PipelineJobApiError(f"{method} {url} failed ({resp.status_code}): {detail}")
    return {}


def get_job_context(api_url: str, job_id: str) -> dict[str, Any]:
    base = api_url.rstrip("/")
    return _request("GET", f"{base}/internal-api/pipeline/jobs/{job_id}")


def patch_job(
    api_url: str,
    job_id: str,
    *,
    stage: str | None = None,
    external_job_id: str | None = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if stage is not None:
        body["stage"] = stage
    if external_job_id is not None:
        body["external_job_id"] = external_job_id
    if error_message is not None:
        body["error_message"] = error_message
    base = api_url.rstrip("/")
    return _request("PATCH", f"{base}/internal-api/pipeline/jobs/{job_id}", json_body=body)


def post_provider_ready(
    api_url: str,
    job_id: str,
    *,
    external_job_id: str | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"event": "provider_ready"}
    if external_job_id:
        body["external_job_id"] = external_job_id
    if provider:
        body["provider"] = provider
    base = api_url.rstrip("/")
    return _request(
        "POST",
        f"{base}/internal-api/pipeline/jobs/{job_id}/events",
        json_body=body,
    )
