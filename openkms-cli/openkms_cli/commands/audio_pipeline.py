"""Audio pipeline CLI: async transcription jobs."""

from typing import Optional

import typer
from rich.console import Console

console = Console(stderr=True)

SUPPORTED_AUDIO_PIPELINES: dict[str, tuple[str, str]] = {
    "aliyun-qwen-audio-transcribe": (
        "Aliyun Qwen-Audio Transcribe",
        "Transcribe audio via DashScope Qwen-Audio-3.0 file transcription API.",
    ),
}

audio_pipeline_app = typer.Typer(
    help="Run async audio transcription pipeline jobs (submit → poll → finalize)",
)


@audio_pipeline_app.command("list")
def audio_pipeline_list() -> None:
    """List supported async audio pipeline names."""
    for name, (display, desc) in SUPPORTED_AUDIO_PIPELINES.items():
        console.print(f"[cyan]{name}[/cyan] — {display}: {desc}")


@audio_pipeline_app.command("submit")
def audio_pipeline_submit(
    job_id: str = typer.Option(..., "--job-id", help="Audio pipeline job UUID from backend"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    from openkms_cli.pipeline.audio_jobs import submit_audio_job

    submit_audio_job(job_id, api_url)


@audio_pipeline_app.command("poll")
def audio_pipeline_poll(
    job_id: str = typer.Option(..., "--job-id", help="Audio pipeline job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    from openkms_cli.pipeline.audio_jobs import poll_audio_job

    poll_audio_job(job_id, api_url)


@audio_pipeline_app.command("run-async")
def audio_pipeline_run_async(
    job_id: str = typer.Option(..., "--job-id", help="Audio pipeline job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    from openkms_cli.pipeline.audio_jobs import run_async_audio_job

    run_async_audio_job(job_id, api_url)
