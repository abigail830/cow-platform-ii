"""Tests for paddle VLM workflow config and async routing."""

from unittest.mock import patch


def test_paddle_workflow_has_vlm_model_name() -> None:
    from openkms_cli.core.workflow_config import load_packaged_default

    cfg = load_packaged_default("paddleocr-doc-parse")
    assert str(cfg.get("model_name") or "").strip()
    assert cfg["page_index"]["strategy"] == "markdown-headings"
    assert "async" not in cfg


def test_run_async_job_routes_paddle_to_sync_vlm() -> None:
    from openkms_cli.pipeline.async_jobs import run_async_job

    ctx = {
        "stage": "submitted",
        "provider": "paddle",
        "pipeline_name": "paddleocr-doc-parse",
        "document": {"id": "doc-1", "name": "scan.pdf", "file_hash": "abc"},
        "input_uri": "s3://bucket/documents/abc/original.pdf",
        "s3_prefix": "documents/abc",
        "config_yaml": None,
    }

    with patch("openkms_cli.pipeline.async_jobs.get_job_context", return_value=ctx):
        with patch("openkms_cli.providers.paddle.job.run_paddle_vlm_sync_job") as mock_paddle:
            with patch("openkms_cli.pipeline.async_jobs._poll_until_provider_ready") as mock_poll:
                run_async_job("job-1", api_url="http://127.0.0.1:8787")
                mock_paddle.assert_called_once()
                mock_poll.assert_not_called()


def test_resolve_vlm_from_workflow() -> None:
    from openkms_cli.providers.paddle.vlm_config import resolve_vlm_from_workflow

    fake = {
        "base_url": "https://api.example/v1",
        "model_name": "PaddlePaddle/PaddleOCR-VL-1.5",
        "api_key": "sk-test",
        "max_concurrency": 2,
    }
    with patch("openkms_cli.providers.paddle.vlm_config.fetch_cli_model_params", return_value=fake):
        cfg = resolve_vlm_from_workflow({"model_name": "paddleocr-vl-1.5"})
    assert cfg.base_url == "https://api.example/v1"
    assert cfg.model_name == "PaddlePaddle/PaddleOCR-VL-1.5"
    assert cfg.api_key == "sk-test"
    assert cfg.max_concurrency == 2
