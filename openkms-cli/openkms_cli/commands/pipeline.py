"""Pipeline CLI: async document parsing jobs (run-async / submit / poll / finalize)."""

from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

console = Console(stderr=True)

SUPPORTED_PIPELINES: dict[str, tuple[str, str]] = {
    "paddleocr-doc-parse": (
        "PaddleOCR Document Parse (platform VLM)",
        "Sync VLM parse via platform model (workflow YAML model_name); markdown-headings page index.",
    ),
    "baidu-doc-parse": (
        "Baidu Cloud Document Parse",
        "Parse via Baidu PaddleOCR-VL API (BOS presigned file_url); async job stages.",
    ),
    "aliyun-docmind-parse": (
        "Aliyun Document Mind Parse",
        "Parse via Aliyun Document Mind (大模型版) with presigned OSS FileUrl; async job stages.",
    ),
    "metadata-extract": (
        "Metadata Extract",
        "LLM metadata extraction on already-parsed documents (job stage=parsed).",
    ),
}

pipeline_app = typer.Typer(
    help="Run async document parsing pipeline jobs (submit → poll → finalize)",
)


@pipeline_app.command("list")
def pipeline_list() -> None:
    """List supported async document-parse pipeline names."""
    table = Table(title="Supported Pipelines")
    table.add_column("Pipeline Name", style="cyan", no_wrap=True)
    table.add_column("Description", style="dim")
    for name, (display, desc) in SUPPORTED_PIPELINES.items():
        table.add_row(name, f"{display}: {desc}")
    console.print(table)
    console.print(
        "\n[dim]Async jobs: pipeline run-async --job-id <id> "
        "[--page-index-strategy markdown-headings|baidu-layouts|aliyun-layouts][/dim]"
    )
    console.print(
        "[dim]Or stepwise: pipeline submit / poll / finalize --job-id <id>[/dim]"
    )


@pipeline_app.command("submit")
def pipeline_submit(
    job_id: str = typer.Option(..., "--job-id", help="Pipeline job UUID from backend"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    """Submit an async pipeline job to the cloud provider (baidu / aliyun)."""
    from openkms_cli.pipeline.async_jobs import submit_job

    submit_job(job_id, api_url)


@pipeline_app.command("poll")
def pipeline_poll(
    job_id: str = typer.Option(..., "--job-id", help="Pipeline job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    """Poll provider status; POST provider_ready when parsing completes."""
    from openkms_cli.pipeline.async_jobs import poll_job

    poll_job(job_id, api_url)


@pipeline_app.command("run-async")
def pipeline_run_async(
    job_id: str = typer.Option(..., "--job-id", help="Pipeline job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
    page_index_strategy: Optional[str] = typer.Option(
        None,
        "--page-index-strategy",
        help="page_index builder: markdown-headings | aliyun-layouts | baidu-layouts",
    ),
    poll_interval: Optional[int] = typer.Option(
        None,
        "--poll-interval",
        min=1,
        help="Seconds between cloud status checks (default: OPENKMS_ASYNC_POLL_INTERVAL_SECONDS)",
    ),
    max_wait: Optional[int] = typer.Option(
        None,
        "--max-wait",
        min=60,
        help="Max seconds to wait for cloud parse (default: OPENKMS_ASYNC_MAX_WAIT_SECONDS)",
    ),
) -> None:
    """Submit to cloud, poll until ready, finalize (+ page index + metadata). One CLI process."""
    from openkms_cli.pipeline.async_jobs import run_async_job

    run_async_job(
        job_id,
        api_url,
        page_index_strategy=page_index_strategy,
        poll_interval=poll_interval,
        max_wait=max_wait,
    )


@pipeline_app.command("finalize")
def pipeline_finalize(
    job_id: str = typer.Option(..., "--job-id", help="Pipeline job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
    page_index_strategy: Optional[str] = typer.Option(
        None,
        "--page-index-strategy",
        help="page_index builder: markdown-headings | aliyun-layouts | baidu-layouts",
    ),
) -> None:
    """Fetch cloud results, build page index, upload, optional metadata — one worker run."""
    from openkms_cli.pipeline.async_jobs import finalize_job

    finalize_job(job_id, api_url, page_index_strategy=page_index_strategy)


@pipeline_app.command("extract-metadata")
def pipeline_extract_metadata(
    job_id: str = typer.Option(..., "--job-id", help="Pipeline job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    """Run metadata extraction for a parsed document job (metadata-extract pipeline or re-run)."""
    from openkms_cli.pipeline.async_jobs import extract_metadata_job

    extract_metadata_job(job_id, api_url)
