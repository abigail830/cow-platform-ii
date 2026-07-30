"""CLI: build page_index.json with selectable strategies."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from openkms_cli.page_index.strategy import SUPPORTED_STRATEGIES, normalize_strategy, write_page_index

console = Console(stderr=True)

page_index_app = typer.Typer(
    help="Build page_index.json (markdown headings or Aliyun layouts)",
)


@page_index_app.command("list-strategies")
def list_strategies() -> None:
    """List supported page-index strategies."""
    for name in SUPPORTED_STRATEGIES:
        console.print(f"  [cyan]{name}[/cyan]")


@page_index_app.command("build")
def build_page_index(
    strategy: str = typer.Option(
        "markdown-headings",
        "--strategy",
        "-s",
        help=f"Strategy name ({', '.join(SUPPORTED_STRATEGIES)})",
    ),
    markdown: Optional[Path] = typer.Option(
        None,
        "--markdown",
        "-m",
        path_type=Path,
        exists=True,
        help="markdown.md path (markdown-headings strategy)",
    ),
    layouts_json: Optional[Path] = typer.Option(
        None,
        "--layouts-json",
        path_type=Path,
        exists=True,
        help="JSON file with Aliyun layouts array (aliyun-layouts strategy)",
    ),
    result_json: Optional[Path] = typer.Option(
        None,
        "--result-json",
        path_type=Path,
        exists=True,
        help="result.json path; used to load layouts when --layouts-json omitted",
    ),
    output: Path = typer.Option(
        Path("page_index.json"),
        "--output",
        "-o",
        path_type=Path,
        help="Output page_index.json path",
    ),
    doc_name: Optional[str] = typer.Option(
        None,
        "--doc-name",
        help="doc_name field in page_index.json",
    ),
    rewrite_markdown: bool = typer.Option(
        False,
        "--rewrite-markdown",
        help="For aliyun-layouts: also rewrite --markdown with layout anchors",
    ),
) -> None:
    """Build page_index.json using an independent strategy module."""
    strategy_name = normalize_strategy(strategy)
    output.parent.mkdir(parents=True, exist_ok=True)

    if strategy_name == "markdown-headings":
        if markdown is None:
            console.print("[red]--markdown is required for markdown-headings[/red]")
            raise typer.Exit(1)
        from openkms_cli.page_index.markdown import write_page_index_from_markdown

        tree = write_page_index_from_markdown(markdown, output)
        console.print(f"[green]Wrote {output} ({len(tree.get('structure') or [])} root nodes)[/green]")
        return

    layouts: list[dict]
    if layouts_json is not None:
        raw = json.loads(layouts_json.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            console.print("[red]--layouts-json must contain a JSON array[/red]")
            raise typer.Exit(1)
        layouts = [item for item in raw if isinstance(item, dict)]
    elif result_json is not None:
        from openkms_cli.page_index.strategy import load_layouts_from_result_json

        data = json.loads(result_json.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("aliyun_layouts"), list):
            layouts = [item for item in data["aliyun_layouts"] if isinstance(item, dict)]
        else:
            layouts = load_layouts_from_result_json(result_json)
            if not layouts and isinstance(data, dict):
                console.print(
                    "[yellow]No layouts in result.json; pass raw Aliyun layouts via --layouts-json[/yellow]"
                )
    else:
        console.print("[red]aliyun-layouts requires --layouts-json or --result-json[/red]")
        raise typer.Exit(1)

    from openkms_cli.page_index.aliyun_layout import write_page_index_from_aliyun_layouts

    md_path = markdown if rewrite_markdown else None
    if rewrite_markdown and markdown is None:
        console.print("[red]--rewrite-markdown requires --markdown[/red]")
        raise typer.Exit(1)

    tree = write_page_index_from_aliyun_layouts(
        layouts,
        doc_name=doc_name or (markdown.stem if markdown else "document"),
        output_path=output,
        markdown_path=md_path,
    )
    roots = len(tree.get("structure") or [])
    console.print(f"[green]Wrote {output} ({roots} root nodes, strategy={strategy_name})[/green]")
    if rewrite_markdown and markdown is not None:
        console.print(f"[dim]Rewrote {markdown} with layout anchors[/dim]")
