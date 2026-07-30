"""Adobe PDF Services REST client — Create PDF (office/images → PDF)."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from openkms_cli.providers.adobe.media_types import media_type_for_extension

DEFAULT_API_BASE = "https://pdf-services.adobe.io"


class AdobePdfServicesError(RuntimeError):
    """Raised when Adobe PDF Services API calls fail."""


@dataclass
class AdobePdfServicesConfig:
    client_id: str
    client_secret: str
    api_base: str = DEFAULT_API_BASE
    poll_interval_seconds: int = 3
    max_wait_seconds: int = 300


class AdobePdfServicesClient:
    """Minimal REST client for token → upload → createpdf → poll → download."""

    def __init__(self, config: AdobePdfServicesConfig, session: requests.Session | None = None) -> None:
        self._config = config
        self._session = session or requests.Session()
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0

    def _base(self) -> str:
        return self._config.api_base.rstrip("/")

    def _headers(self, *, json: bool = False) -> dict[str, str]:
        token = self._get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "X-API-Key": self._config.client_id,
        }
        if json:
            headers["Content-Type"] = "application/json"
        return headers

    def _get_access_token(self) -> str:
        now = time.monotonic()
        if self._access_token and now < self._token_expires_at:
            return self._access_token

        url = f"{self._base()}/token"
        resp = self._session.post(
            url,
            data={
                "client_id": self._config.client_id,
                "client_secret": self._config.client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=60,
        )
        if not resp.ok:
            raise AdobePdfServicesError(
                f"Adobe token request failed ({resp.status_code}): {(resp.text or '')[:500]}"
            )
        data = resp.json()
        token = data.get("access_token")
        if not isinstance(token, str) or not token.strip():
            raise AdobePdfServicesError("Adobe token response missing access_token")
        expires_in = data.get("expires_in", 3600)
        try:
            ttl = int(expires_in)
        except (TypeError, ValueError):
            ttl = 3600
        self._access_token = token
        self._token_expires_at = now + max(60, ttl - 60)
        return token

    def upload_asset(self, content: bytes, media_type: str) -> str:
        url = f"{self._base()}/assets"
        resp = self._session.post(
            url,
            json={"mediaType": media_type},
            headers=self._headers(json=True),
            timeout=60,
        )
        if not resp.ok:
            raise AdobePdfServicesError(
                f"Adobe assets upload init failed ({resp.status_code}): {(resp.text or '')[:500]}"
            )
        body = resp.json()
        upload_uri = body.get("uploadUri")
        asset_id = body.get("assetID")
        if not isinstance(upload_uri, str) or not isinstance(asset_id, str):
            raise AdobePdfServicesError("Adobe assets response missing uploadUri or assetID")

        put_resp = self._session.put(
            upload_uri,
            data=content,
            headers={"Content-Type": media_type},
            timeout=600,
        )
        if not put_resp.ok:
            raise AdobePdfServicesError(
                f"Adobe asset PUT failed ({put_resp.status_code}): {(put_resp.text or '')[:500]}"
            )
        return asset_id

    def create_pdf_job(self, asset_id: str, *, document_language: str | None = None) -> str:
        url = f"{self._base()}/operation/createpdf"
        payload: dict[str, Any] = {"assetID": asset_id}
        if document_language:
            payload["documentLanguage"] = document_language
        resp = self._session.post(
            url,
            json=payload,
            headers=self._headers(json=True),
            timeout=60,
        )
        if resp.status_code not in (200, 201):
            raise AdobePdfServicesError(
                f"Adobe createpdf failed ({resp.status_code}): {(resp.text or '')[:500]}"
            )
        location = resp.headers.get("location") or resp.headers.get("Location")
        if not location:
            raise AdobePdfServicesError("Adobe createpdf response missing Location header")
        return location

    def poll_job(self, location: str) -> dict[str, Any]:
        deadline = time.monotonic() + self._config.max_wait_seconds
        attempt = 0
        while time.monotonic() < deadline:
            attempt += 1
            resp = self._session.get(
                location,
                headers=self._headers(),
                timeout=60,
            )
            if not resp.ok:
                raise AdobePdfServicesError(
                    f"Adobe job poll failed ({resp.status_code}): {(resp.text or '')[:500]}"
                )
            data = resp.json()
            status = str(data.get("status", "")).lower().replace("_", " ")
            if status == "done":
                return data
            if status == "failed":
                detail = data.get("error") or data.get("message") or data
                raise AdobePdfServicesError(f"Adobe Create PDF job failed: {detail}")
            time.sleep(self._config.poll_interval_seconds)
        raise AdobePdfServicesError(
            f"Timed out waiting for Adobe Create PDF after {self._config.max_wait_seconds}s"
        )

    def download_result(self, poll_result: dict[str, Any]) -> bytes:
        download_uri = (
            poll_result.get("downloadUri")
            or poll_result.get("dowloadUri")
            or (poll_result.get("asset") or {}).get("downloadUri")
            or (poll_result.get("asset") or {}).get("dowloadUri")
        )
        if not isinstance(download_uri, str) or not download_uri.strip():
            raise AdobePdfServicesError("Adobe job result missing downloadUri")
        resp = self._session.get(download_uri, timeout=600)
        if not resp.ok:
            raise AdobePdfServicesError(
                f"Adobe PDF download failed ({resp.status_code}): {(resp.text or '')[:500]}"
            )
        return resp.content

    def convert_file_to_pdf(self, src: Path, out_dir: Path) -> Path:
        if not src.is_file():
            raise AdobePdfServicesError(f"Input not found: {src}")
        out_dir.mkdir(parents=True, exist_ok=True)
        ext = src.suffix.lower()
        media_type = media_type_for_extension(ext)
        content = src.read_bytes()
        asset_id = self.upload_asset(content, media_type)
        location = self.create_pdf_job(asset_id)
        result = self.poll_job(location)
        pdf_bytes = self.download_result(result)
        pdf_path = out_dir / f"{src.stem}.pdf"
        pdf_path.write_bytes(pdf_bytes)
        return pdf_path


def client_from_settings() -> AdobePdfServicesClient:
    from openkms_cli.core.settings import get_cli_settings

    cfg = get_cli_settings()
    client_id = (cfg.adobe_client_id or "").strip()
    client_secret = (cfg.adobe_client_secret or "").strip()
    if not client_id or not client_secret:
        raise AdobePdfServicesError(
            "Adobe PDF Services credentials not configured "
            "(OPENKMS_ADOBE_CLIENT_ID / OPENKMS_ADOBE_CLIENT_SECRET or ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET)."
        )
    return AdobePdfServicesClient(
        AdobePdfServicesConfig(
            client_id=client_id,
            client_secret=client_secret,
            api_base=(cfg.adobe_api_base or DEFAULT_API_BASE).strip() or DEFAULT_API_BASE,
            poll_interval_seconds=cfg.adobe_poll_interval_seconds,
            max_wait_seconds=cfg.adobe_max_wait_seconds,
        )
    )
