"""Document parsing CLI commands (Baidu Cloud PaddleOCR-VL API)."""

import json
from pathlib import Path
from typing import Any, Optional

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn

from openkms_cli.core.settings import get_cli_settings

console = Console()

parse_app = typer.Typer(
    help="Parse documents via Baidu Cloud PaddleOCR-VL API (baidu-doc-parse)",
)

_PARSE_METHODS = frozenset({"baidu-doc-parse", "paddleocr-doc-parse"})


def _json_default(obj: Any) -> Any:
    try:
        import numpy as np

        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer, np.floating)):
            return float(obj) if isinstance(obj, np.floating) else int(obj)
    except ImportError:
        pass
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _resolve_parse_method(method: str) -> str:
    if method not in _PARSE_METHODS:
        console.print(
            f"[red]Unknown --method {method!r}. Choose from: {', '.join(sorted(_PARSE_METHODS))}[/red]"
        )
        raise typer.Exit(1)
    if method == "paddleocr-doc-parse":
        console.print(
            "[yellow]--method paddleocr-doc-parse is deprecated; use baidu-doc-parse "
            "(same Baidu Cloud API).[/yellow]"
        )
    return method


@parse_app.command("run")
def parse_run(
    input_path: Path = typer.Argument(
        ...,
        path_type=Path,
        exists=True,
        help="Input file or directory for batch parse",
    ),
    output_dir: Optional[Path] = typer.Option(
        None,
        "--output",
        "-o",
        path_type=Path,
        help="Output directory. Default: <input_dir>/parsed or ./parsed",
    ),
    method: str = typer.Option(
        "baidu-doc-parse",
        "--method",
        "-m",
        help="Parse backend (baidu-doc-parse; paddleocr-doc-parse is a deprecated alias)",
    ),
    baidu_poll_interval: int = typer.Option(
        8,
        "--baidu-poll-interval",
        help="Seconds between Baidu task status polls",
    ),
    baidu_max_wait: int = typer.Option(
        600,
        "--baidu-max-wait",
        help="Max seconds to wait for Baidu parse task",
    ),
) -> None:
    """
    Parse document(s) via Baidu Cloud. Output structure matches openKMS backend:
      {file_hash}/original.{ext}
      {file_hash}/result.json
      {file_hash}/markdown.md
      ...
    """
    _resolve_parse_method(method)
    s = get_cli_settings()

    if not s.baidu_cloud_api_key or not s.baidu_cloud_secret_key:
        console.print(
            "[red]Baidu parse requires OPENKMS_BAIDU_CLOUD_API_KEY and "
            "OPENKMS_BAIDU_CLOUD_SECRET_KEY[/red]"
        )
        raise typer.Exit(1)

    from openkms_cli.parse.markdown_ingest import MARKDOWN_EXTENSIONS
    from openkms_cli.providers.baidu.parser import _BAIDU_ADOBE_EXT, _BAIDU_NATIVE_EXT

    batch_exts = set(_BAIDU_NATIVE_EXT) | {".epub"} | set(_BAIDU_ADOBE_EXT) | set(MARKDOWN_EXTENSIONS)

    if input_path.is_file():
        files = [input_path]
        out_base = output_dir or input_path.parent / "parsed"
    else:
        files = [p for p in input_path.rglob("*") if p.is_file() and p.suffix.lower() in batch_exts]
        if not files:
            console.print("[yellow]No supported files found[/yellow]")
            raise typer.Exit(0)
        out_base = output_dir or input_path / "parsed"

    out_base.mkdir(parents=True, exist_ok=True)

    try:
        from openkms_cli.providers.baidu.parser import BaiduParseError, prepare_for_baidu_parse, run_baidu_parser
    except ImportError as e:
        console.print("[red]Baidu parser not available. pip install openkms-cli (requests)[/red]")
        console.print(f"[dim]{e}[/dim]")
        raise typer.Exit(1)

    with Progress(
        SpinnerColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Parsing...", total=len(files))
        for fp in files:
            progress.update(task, description=f"Parsing {fp.name}")
            try:
                from openkms_cli.parse.markdown_ingest import is_markdown_suffix, materialize_markdown_ingest

                work_sub = out_base / "_baidu_tmp"
                if is_markdown_suffix(fp.suffix):
                    content = fp.read_bytes()
                    materialize_markdown_ingest(
                        stored_input=fp.resolve(),
                        original_content=content,
                        out_base=out_base,
                    )
                else:
                    try:
                        parse_path, hash_src = prepare_for_baidu_parse(fp.resolve(), work_sub)
                    except BaiduParseError as e:
                        console.print(f"[red]{fp}: {e}[/red]")
                        raise typer.Exit(1)

                    ch_source = None if parse_path.resolve() == hash_src.resolve() else hash_src

                    def _baidu_status(status: str) -> None:
                        progress.update(task, description=f"Baidu parse: {status}...")

                    result, _, _ = run_baidu_parser(
                        input_path=parse_path,
                        output_dir=out_base,
                        api_key=s.baidu_cloud_api_key,
                        secret_key=s.baidu_cloud_secret_key,
                        content_hash_source=ch_source,
                        poll_interval=baidu_poll_interval,
                        max_wait=baidu_max_wait,
                        on_status=_baidu_status,
                    )
                    file_hash = result["file_hash"]
                    hash_dir = out_base / file_hash

                    ext = Path(hash_src).suffix.lower().lstrip(".") or "bin"
                    (hash_dir / f"original.{ext}").write_bytes(Path(hash_src).read_bytes())

                    result_json = json.dumps(
                        result, indent=2, ensure_ascii=False, default=_json_default
                    )
                    (hash_dir / "result.json").write_text(result_json, encoding="utf-8")
                    if result.get("markdown"):
                        (hash_dir / "markdown.md").write_text(result["markdown"], encoding="utf-8")
            except BaiduParseError as e:
                console.print(f"[red]Failed {fp}: {e}[/red]")
                raise typer.Exit(1)
            except Exception as e:
                console.print(f"[red]Failed {fp}: {e}[/red]")
                raise typer.Exit(1)
            progress.advance(task)

    console.print(f"[green]Parsed {len(files)} file(s) to {out_base}[/green]")
