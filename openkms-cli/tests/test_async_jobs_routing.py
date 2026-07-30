"""Async job routing: native ingest vs cloud OCR."""

from unittest.mock import patch


def test_run_async_job_routes_native_ingest() -> None:
    from openkms_cli.pipeline.async_jobs import run_async_job

    ctx = {
        "stage": "submitted",
        "provider": "aliyun",
        "document": {"id": "doc-1", "name": "readme.md"},
        "input_uri": "s3://bucket/documents/abc/original.md",
        "s3_prefix": "documents/abc",
        "extraction_args": "",
    }

    with patch("openkms_cli.pipeline.async_jobs.get_job_context", return_value=ctx):
        with patch("openkms_cli.pipeline.native_job.run_native_ingest_async_job") as mock_native:
            run_async_job("job-1", api_url="http://127.0.0.1:8787")
            mock_native.assert_called_once()


def test_run_async_job_routes_xmind_to_native_ingest() -> None:
    from openkms_cli.pipeline.async_jobs import run_async_job

    ctx = {
        "stage": "submitted",
        "provider": "baidu",
        "document": {"id": "doc-1", "name": "plan.xmind"},
        "input_uri": "s3://bucket/documents/abc/original.xmind",
        "s3_prefix": "documents/abc",
        "extraction_args": "",
    }

    with patch("openkms_cli.pipeline.async_jobs.get_job_context", return_value=ctx):
        with patch("openkms_cli.pipeline.native_job.run_native_ingest_async_job") as mock_native:
            run_async_job("job-1", api_url="http://127.0.0.1:8787")
            mock_native.assert_called_once()


def test_run_async_job_routes_cloud_pdf_to_poll_finalize() -> None:
    from openkms_cli.pipeline.async_jobs import run_async_job

    ctx = {
        "stage": "submitted",
        "provider": "baidu",
        "external_job_id": "task-123",
        "document": {"id": "doc-1", "name": "scan.pdf"},
        "input_uri": "s3://bucket/documents/abc/original.pdf",
        "s3_prefix": "documents/abc",
        "extraction_args": "",
    }

    with patch("openkms_cli.pipeline.async_jobs.get_job_context", return_value=ctx):
        with patch("openkms_cli.pipeline.native_job.run_native_ingest_async_job") as mock_native:
            with patch("openkms_cli.pipeline.async_jobs._poll_until_provider_ready"):
                with patch("openkms_cli.pipeline.async_jobs.finalize_job") as mock_finalize:
                    run_async_job("job-1", api_url="http://127.0.0.1:8787")
                    mock_native.assert_not_called()
                    mock_finalize.assert_called_once()
