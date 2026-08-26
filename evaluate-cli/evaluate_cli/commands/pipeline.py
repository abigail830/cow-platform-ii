"""Evaluation run pipeline: async ASR jobs for dataset items."""

from typing import Optional

import typer

pipeline_app = typer.Typer(
    help="Run async eval pipeline jobs (submit → poll → finalize)",
)


@pipeline_app.command("submit")
def pipeline_submit(
    job_id: str = typer.Option(..., "--job-id", help="Eval run item UUID from backend"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    from evaluate_cli.pipeline.jobs import submit_eval_job

    submit_eval_job(job_id, api_url)


@pipeline_app.command("poll")
def pipeline_poll(
    job_id: str = typer.Option(..., "--job-id", help="Eval run item UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    from evaluate_cli.pipeline.jobs import poll_eval_job

    poll_eval_job(job_id, api_url)


@pipeline_app.command("run-async")
def pipeline_run_async(
    job_id: str = typer.Option(..., "--job-id", help="Eval run item UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    from evaluate_cli.pipeline.jobs import run_async_eval_job

    run_async_eval_job(job_id, api_url)
