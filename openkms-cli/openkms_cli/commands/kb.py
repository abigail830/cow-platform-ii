"""Knowledge base CLI commands (isolated from document parse pipeline)."""

from typing import Optional

import typer
from rich.console import Console

console = Console(stderr=True)

kb_app = typer.Typer(help="Knowledge base workers (PageIndex import, RAG index, FAQ extract/index)")


@kb_app.command("pageindex-import")
def kb_pageindex_import(
    job_id: str = typer.Option(..., "--job-id", help="PageIndex KB import job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    """Import parsed document artifacts from S3 into a PageIndex knowledge base."""
    from openkms_cli.kb.pageindex_import import run_pageindex_import

    run_pageindex_import(job_id, api_url=api_url)


@kb_app.command("rag-index")
def kb_rag_index(
    job_id: str = typer.Option(..., "--job-id", help="RAG KB index job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    """Chunk markdown, embed, and store vectors for a RAG knowledge base."""
    from openkms_cli.kb.rag_index import run_rag_index

    run_rag_index(job_id, api_url=api_url)


@kb_app.command("faq-index")
def kb_faq_index(
    job_id: str = typer.Option(..., "--job-id", help="FAQ KB index job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    """Embed published FAQ questions for a FAQ knowledge base."""
    from openkms_cli.kb.faq_index import run_faq_index

    run_faq_index(job_id, api_url=api_url)


@kb_app.command("faq-extract")
def kb_faq_extract(
    job_id: str = typer.Option(..., "--job-id", help="FAQ extract job UUID"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend API URL"),
) -> None:
    """Extract FAQ drafts from document markdown using configured LLM."""
    from openkms_cli.kb.faq_extract import run_faq_extract

    run_faq_extract(job_id, api_url=api_url)
