"""Judge commands — DeepEval LLM-as-judge for eval runs."""

from typing import Optional

import typer

judge_app = typer.Typer(help="LLM-as-judge evaluation jobs (DeepEval GEval)")


@judge_app.command("run-async")
def judge_run_async(
    job_id: str = typer.Option(..., "--job-id", help="Eval judge job UUID from backend"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    from evaluate_cli.judge.jobs import run_async_judge_job

    run_async_judge_job(job_id, api_url)
