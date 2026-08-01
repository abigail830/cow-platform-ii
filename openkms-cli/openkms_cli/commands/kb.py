"""Knowledge base CLI commands (isolated from document parse pipeline)."""

from typing import Optional

import typer
from rich.console import Console

console = Console(stderr=True)

kb_app = typer.Typer(help="Knowledge base operations (PageIndex import, future RAG index)")


@kb_app.command("pageindex-import")
def kb_pageindex_import(
    job_id: str = typer.Option(..., "--job-id", help="PageIndex KB import job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    """Import parsed document artifacts from S3 into a PageIndex knowledge base."""
    from openkms_cli.kb.pageindex_import import run_pageindex_import

    run_pageindex_import(job_id, api_url=api_url)
