"""Main Typer app for openkms-cli."""

import typer
from rich.console import Console

from .commands.kb import kb_app
from .commands.page_index import page_index_app
from .commands.parse import parse_app
from .commands.audio_pipeline import audio_pipeline_app
from .commands.pipeline import pipeline_app
from .commands.wiki import wiki_app

console = Console()

app = typer.Typer(
    name="openkms-cli",
    help="OpenKMS CLI - document parsing and pipeline tools for backend integration",
    add_completion=False,
)

app.add_typer(parse_app, name="parse", help="Document parsing commands")
app.add_typer(kb_app, name="kb", help="Knowledge base workers (PageIndex import, RAG index, FAQ)")
app.add_typer(page_index_app, name="page-index", help="Build page_index.json (strategy-selectable)")
app.add_typer(pipeline_app, name="pipeline", help="Async document-parse pipeline jobs")
app.add_typer(audio_pipeline_app, name="audio-pipeline", help="Async audio transcription pipeline jobs")
app.add_typer(wiki_app, name="wiki", help="Wiki spaces: put, sync, upload-file")


@app.command()
def version() -> None:
    """Show CLI version."""
    from . import __version__
    console.print(f"[green]openkms-cli v{__version__}[/green]")
