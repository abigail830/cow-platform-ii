"""Audio capture post-process CLI."""

from typing import Optional

import typer
from rich.console import Console

console = Console(stderr=True)

audio_capture_app = typer.Typer(
    help="Post-process audio captures (merge transcripts, structure, classify, extract)",
)


@audio_capture_app.command("post-process")
def capture_post_process(
    job_id: str = typer.Option(..., "--job-id", help="Capture pipeline job UUID from backend"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    from openkms_cli.pipeline.capture_post_process import run_capture_post_process

    run_capture_post_process(job_id, api_url)
