"""Tests for async native ingest job."""

from unittest.mock import MagicMock, patch

import pytest


def test_run_native_ingest_async_job_submitted_flow() -> None:
    from openkms_cli.pipeline.native_job import run_native_ingest_async_job

    ctx = {
        "stage": "submitted",
        "pipeline_name": "baidu-doc-parse",
        "document": {"id": "doc-1", "name": "readme.md", "file_hash": "a" * 64},
        "input_uri": "s3://bucket/documents/x/original.md",
        "s3_prefix": "documents/x",
        "config_yaml": None,
    }
    stored = MagicMock()
    stored.read_bytes.return_value = b"# Title"

    with patch("openkms_cli.pipeline.native_job.download_input_to_temp", return_value=(stored, b"# Title", "md")):
        with patch(
            "openkms_cli.pipeline.native_job.run_native_ingest",
            return_value=({"markdown": "# Title", "file_hash": "a" * 64}, MagicMock()),
        ) as mock_ingest:
            with patch("openkms_cli.pipeline.native_job.finalize_job_artifacts") as mock_finalize:
                run_native_ingest_async_job("job-1", "http://api", ctx)

    mock_ingest.assert_called_once()
    mock_finalize.assert_called_once()


def test_run_native_ingest_async_job_rejects_cloud_kind() -> None:
    from openkms_cli.pipeline.native_job import run_native_ingest_async_job

    ctx = {
        "stage": "submitted",
        "document": {"id": "doc-1", "name": "scan.pdf"},
        "input_uri": "s3://bucket/documents/x/original.pdf",
        "s3_prefix": "documents/x",
    }

    with patch("openkms_cli.pipeline.native_job.fail_job") as mock_fail:
        with pytest.raises(SystemExit):
            run_native_ingest_async_job("job-1", "http://api", ctx)
        mock_fail.assert_called_once()


def test_run_native_ingest_async_job_parsed_stage_metadata() -> None:
    from openkms_cli.pipeline.native_job import run_native_ingest_async_job

    ctx = {
        "stage": "parsed",
        "pipeline_name": "baidu-doc-parse",
        "document": {"id": "doc-1", "name": "readme.md"},
        "config_yaml": None,
    }

    with patch("openkms_cli.pipeline.native_job.run_metadata_extraction_from_ctx") as mock_meta:
        run_native_ingest_async_job("job-1", "http://api", ctx)
        mock_meta.assert_called_once()
