"""Tests for Adobe PDF Services client (mocked HTTP)."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from openkms_cli.providers.adobe.media_types import media_type_for_extension
from openkms_cli.providers.adobe.pdf_services import (
    AdobePdfServicesClient,
    AdobePdfServicesConfig,
    AdobePdfServicesError,
)


def test_media_type_for_docx() -> None:
    assert (
        media_type_for_extension(".docx")
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


def test_convert_file_to_pdf_happy_path(tmp_path: Path) -> None:
    src = tmp_path / "sample.docx"
    src.write_bytes(b"docx-bytes")
    out_dir = tmp_path / "out"
    client = AdobePdfServicesClient(
        AdobePdfServicesConfig(client_id="cid", client_secret="secret"),
        session=MagicMock(),
    )

    token_resp = MagicMock(ok=True, status_code=200)
    token_resp.json.return_value = {"access_token": "tok", "expires_in": 3600}

    assets_resp = MagicMock(ok=True, status_code=200)
    assets_resp.json.return_value = {
        "uploadUri": "https://upload.example/put",
        "assetID": "urn:aaid:AS:UE1:abc",
    }

    put_resp = MagicMock(ok=True, status_code=200)

    create_resp = MagicMock(ok=True, status_code=201)
    create_resp.headers = {"location": "https://pdf-services.adobe.io/operation/createpdf/job1"}

    poll_resp = MagicMock(ok=True, status_code=200)
    poll_resp.json.return_value = {"status": "done", "downloadUri": "https://download.example/pdf"}

    download_resp = MagicMock(ok=True, status_code=200)
    download_resp.content = b"%PDF-1.4 adobe"

    client._session.post.side_effect = [token_resp, assets_resp, create_resp]
    client._session.put.return_value = put_resp
    client._session.get.side_effect = [poll_resp, download_resp]

    pdf_path = client.convert_file_to_pdf(src, out_dir)
    assert pdf_path.is_file()
    assert pdf_path.read_bytes() == b"%PDF-1.4 adobe"


def test_convert_file_to_pdf_poll_failed(tmp_path: Path) -> None:
    src = tmp_path / "sample.docx"
    src.write_bytes(b"docx-bytes")
    client = AdobePdfServicesClient(
        AdobePdfServicesConfig(client_id="cid", client_secret="secret", poll_interval_seconds=0),
        session=MagicMock(),
    )

    token_resp = MagicMock(ok=True, status_code=200)
    token_resp.json.return_value = {"access_token": "tok", "expires_in": 3600}
    assets_resp = MagicMock(ok=True, status_code=200)
    assets_resp.json.return_value = {
        "uploadUri": "https://upload.example/put",
        "assetID": "urn:aaid:AS:UE1:abc",
    }
    put_resp = MagicMock(ok=True, status_code=200)
    create_resp = MagicMock(ok=True, status_code=201)
    create_resp.headers = {"location": "https://pdf-services.adobe.io/operation/createpdf/job1"}
    poll_resp = MagicMock(ok=True, status_code=200)
    poll_resp.json.return_value = {"status": "failed", "error": "bad file"}

    client._session.post.side_effect = [token_resp, assets_resp, create_resp]
    client._session.put.return_value = put_resp
    client._session.get.return_value = poll_resp

    with pytest.raises(AdobePdfServicesError, match="failed"):
        client.convert_file_to_pdf(src, tmp_path / "out")


def test_client_from_settings_missing_credentials() -> None:
    from openkms_cli.providers.adobe.pdf_services import client_from_settings

    with patch("openkms_cli.core.settings.get_cli_settings") as mock_settings:
        mock_settings.return_value.adobe_client_id = ""
        mock_settings.return_value.adobe_client_secret = ""
        with pytest.raises(AdobePdfServicesError, match="credentials not configured"):
            client_from_settings()
