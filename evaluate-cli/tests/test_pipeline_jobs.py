"""Evaluation pipeline async job routing."""

from unittest.mock import patch


def test_run_async_eval_job_submits_then_polls() -> None:
    from evaluate_cli.pipeline.jobs import run_async_eval_job

    ctx_submitted = {
        "stage": "submitted",
        "external_job_id": "",
        "dataset_item": {"name": "sample.wav"},
        "input_uri": "s3://bucket/datasets/x/items/y/input/sample.wav",
        "s3_prefix": "eval-runs/run/variants/v/items/i/",
        "pipeline_name": "aliyun-qwen-audio-transcribe",
        "config_yaml": None,
    }

    with patch("evaluate_cli.pipeline.jobs.get_eval_job_context", return_value=ctx_submitted):
        with patch("evaluate_cli.pipeline.jobs.submit_eval_job") as mock_submit:
            with patch("evaluate_cli.pipeline.jobs.poll_eval_job") as mock_poll:
                with patch("evaluate_cli.pipeline.jobs.patch_eval_job") as mock_patch:
                    run_async_eval_job("job-1", api_url="http://127.0.0.1:8787")
                    mock_submit.assert_called_once_with("job-1", "http://127.0.0.1:8787")
                    mock_poll.assert_called_once()
                    assert mock_poll.call_args.args == ("job-1", "http://127.0.0.1:8787")
                    assert isinstance(mock_poll.call_args.kwargs.get("metrics"), dict)


def test_run_async_eval_job_skips_done() -> None:
    from evaluate_cli.pipeline.jobs import run_async_eval_job

    ctx_done = {"stage": "done"}

    with patch("evaluate_cli.pipeline.jobs.get_eval_job_context", return_value=ctx_done):
        with patch("evaluate_cli.pipeline.jobs.submit_eval_job") as mock_submit:
            with patch("evaluate_cli.pipeline.jobs.poll_eval_job") as mock_poll:
                run_async_eval_job("job-1", api_url="http://127.0.0.1:8787")
                mock_submit.assert_not_called()
                mock_poll.assert_not_called()
