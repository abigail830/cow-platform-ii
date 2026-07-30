"""Regression: async_jobs must import markdown helpers used in run_async_job."""

from unittest.mock import patch


def test_run_async_job_does_not_raise_name_error_for_markdown_check() -> None:
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
        with patch("openkms_cli.pipeline.markdown_ingest_job.run_markdown_ingest_async_job") as mock_md:
            run_async_job("job-1", api_url="http://127.0.0.1:8787")
            mock_md.assert_called_once()
