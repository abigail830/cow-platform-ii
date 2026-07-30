"""Adobe PDF conversion helpers shared by Baidu / cloud parse pipelines."""

from __future__ import annotations

from pathlib import Path

from openkms_cli.providers.adobe.pdf_services import AdobePdfServicesError, client_from_settings


class InputPrepareError(RuntimeError):
    """Raised when input cannot be prepared for parse upload."""


def convert_via_adobe(stored_input: Path, convert_parent: Path) -> Path:
    """Convert a supported Office/spreadsheet file to PDF via Adobe Create PDF."""
    work = convert_parent / "adobe_out"
    work.mkdir(parents=True, exist_ok=True)
    try:
        client = client_from_settings()
        return client.convert_file_to_pdf(stored_input, work)
    except AdobePdfServicesError as e:
        raise InputPrepareError(str(e)) from e


# Backward-compatible aliases (local VLM path removed).
OfficeConvertError = InputPrepareError
