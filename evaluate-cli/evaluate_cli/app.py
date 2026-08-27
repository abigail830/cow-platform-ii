"""Main Typer app for evaluate-cli."""

import typer
from rich.console import Console

from .commands.pipeline import pipeline_app
from .commands.judge import judge_app

console = Console()

app = typer.Typer(
    name="evaluate-cli",
    help="Evaluation workers — ASR pipeline compare (Phase 2) and LLM judge (Phase 3)",
    add_completion=False,
)

app.add_typer(pipeline_app, name="pipeline", help="Async ASR pipeline jobs for evaluation runs")
app.add_typer(judge_app, name="judge", help="DeepEval LLM-as-judge jobs for evaluation runs")


@app.command()
def version() -> None:
    """Show CLI version."""
    from . import __version__

    console.print(f"[green]evaluate-cli v{__version__}[/green]")
