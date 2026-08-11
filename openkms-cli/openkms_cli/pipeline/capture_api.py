"""Internal API client for capture post-process pipeline jobs."""

from __future__ import annotations

from typing import Any

import requests

from openkms_cli.core.auth import auth_expired_response, try_api_request_auth


class CapturePipelineJobApiError(RuntimeError):
    """Raised when a capture pipeline job API call fails."""


def _auth() -> tuple[dict[str, str], tuple[str, str] | None]:
    cred = try_api_request_auth()
    if cred is None:
        raise CapturePipelineJobApiError(
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
        raise CapturePipelineJobApiError(f"{method} {url} failed ({resp.status_code}): {detail}")
    return {}


def get_capture_job_context(api_url: str, job_id: str) -> dict[str, Any]:
    base = api_url.rstrip("/")
    return _request("GET", f"{base}/internal-api/audio-capture-pipeline/jobs/{job_id}")


def patch_capture_job(
    api_url: str,
    job_id: str,
    *,
    stage: str | None = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if stage is not None:
        body["stage"] = stage
    if error_message is not None:
        body["error_message"] = error_message
    base = api_url.rstrip("/")
    return _request("PATCH", f"{base}/internal-api/audio-capture-pipeline/jobs/{job_id}", json_body=body)
