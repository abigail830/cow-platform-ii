"""Document parsing CLI commands."""

import json
from pathlib import Path
from typing import Any, Optional

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn

from openkms_cli.core.backend_defaults import resolve_vlm_config
from openkms_cli.core.settings import get_cli_settings

console = Console()

parse_app = typer.Typer(
    help="Parse documents locally (PaddleOCR-VL) or via Baidu Cloud (baidu-doc-parse)",
)

_PARSE_METHODS = ("paddleocr-doc-parse", "baidu-doc-parse")
_PADDLE_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".docx", ".pptx", ".epub"}


def _json_default(obj: Any) -> Any:
    """Fallback for any remaining non-JSON-serializable values (e.g. ndarray)."""
    try:
        import numpy as np

        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer, np.floating)):
            return float(obj) if isinstance(obj, np.floating) else int(obj)
    except ImportError:
        pass
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


@parse_app.command("run")
def parse_run(
    input_path: Path = typer.Argument(
        ...,
        path_type=Path,
        exists=True,
        help="Input file (PDF, PNG, JPG, JPEG, WEBP, DOCX, PPTX, EPUB) or directory for batch",
    ),
    output_dir: Optional[Path] = typer.Option(
        None,
        "--output",
        "-o",
        path_type=Path,
        help="Output directory. Default: <input_dir>/parsed or ./parsed",
    ),
    vlm_url: Optional[str] = typer.Option(
        None,
        "--vlm-url",
        help="VLM server URL (overrides OPENKMS_VLM_URL; standalone with --model)",
    ),
    model: Optional[str] = typer.Option(
        None,
        "--model",
        help="VLM API model id (overrides OPENKMS_VLM_MODEL; standalone with --vlm-url)",
    ),
    vlm_api_key: Optional[str] = typer.Option(
        None,
        "--vlm-api-key",
        help="VLM API key (overrides OPENKMS_VLM_API_KEY)",
    ),
    vlm_config_name: Optional[str] = typer.Option(
        None,
        "--vlm-config-name",
        help="Model config display name; fetches base_url/api_key/model from backend when set",
    ),
    max_concurrency: Optional[int] = typer.Option(
        None,
        "--max-concurrency",
        help="Max concurrent VLM requests (default: OPENKMS_VLM_MAX_CONCURRENCY)",
    ),
    config_path: Optional[Path] = typer.Option(
        None,
        "--config",
        "-c",
        path_type=Path,
        exists=True,
        help="JSON file with vlm_url, model, vlm_api_key, max_concurrency, vlm_config_name",
    ),
    method: str = typer.Option(
        "paddleocr-doc-parse",
        "--method",
        "-m",
        help="Parse backend: paddleocr-doc-parse (local VLM) or baidu-doc-parse (Baidu Cloud API)",
    ),
    baidu_poll_interval: int = typer.Option(
        8,
        "--baidu-poll-interval",
        help="Seconds between Baidu task status polls (baidu-doc-parse only)",
    ),
    baidu_max_wait: int = typer.Option(
        600,
        "--baidu-max-wait",
        help="Max seconds to wait for Baidu parse task (baidu-doc-parse only)",
    ),
) -> None:
    """
    Parse document(s). Output structure matches openKMS backend:
      {file_hash}/original.{ext}
      {file_hash}/result.json
      {file_hash}/markdown.md
      {file_hash}/layout_det_*_input_img_0.png
      {file_hash}/block_*.png
      {file_hash}/markdown_out/*.md, imgs/*.jpg
    """
    if method not in _PARSE_METHODS:
        console.print(
            f"[red]Unknown --method {method!r}. Choose from: {', '.join(_PARSE_METHODS)}[/red]"
        )
        raise typer.Exit(1)

    use_baidu = method == "baidu-doc-parse"
    s = get_cli_settings()

    vlm_runtime = None
    if not use_baidu:
        file_config: dict[str, Any] | None = None
        if config_path:
            try:
                file_config = json.loads(config_path.read_text())
            except Exception as e:
                console.print(f"[red]Failed to load config: {e}[/red]")
                raise typer.Exit(1)

        vlm_runtime = resolve_vlm_config(
            s,
            cli_vlm_url=vlm_url,
            cli_model=model,
            cli_vlm_api_key=vlm_api_key,
            cli_max_concurrency=max_concurrency,
            cli_config_lookup_name=vlm_config_name,
            file_config=file_config,
        )
    elif not s.baidu_cloud_api_key or not s.baidu_cloud_secret_key:
        console.print(
            "[red]baidu-doc-parse requires OPENKMS_BAIDU_CLOUD_API_KEY and "
            "OPENKMS_BAIDU_CLOUD_SECRET_KEY[/red]"
        )
        raise typer.Exit(1)

    if input_path.is_file():
        files = [input_path]
        out_base = output_dir or input_path.parent / "parsed"
    else:
        if use_baidu:
            from openkms_cli.providers.baidu.parser import _BAIDU_NATIVE_EXT

            exts = set(_BAIDU_NATIVE_EXT) | {".epub"}
        else:
            exts = _PADDLE_EXTS
        files = [p for p in input_path.rglob("*") if p.is_file() and p.suffix.lower() in exts]
        if not files:
            console.print("[yellow]No supported files found[/yellow]")
            raise typer.Exit(0)
        out_base = output_dir or input_path / "parsed"

    out_base.mkdir(parents=True, exist_ok=True)

    if use_baidu:
        try:
            from openkms_cli.providers.baidu.parser import BaiduParseError, prepare_for_baidu_parse, run_baidu_parser
        except ImportError as e:
            console.print("[red]Baidu parser not available. pip install openkms-cli (requests)[/red]")
            console.print(f"[dim]{e}[/dim]")
            raise typer.Exit(1)
    else:
        try:
            from openkms_cli.parse.parser import run_parser
        except ImportError as e:
            console.print(
                "[red]Parser not available. Install optional dependencies:[/red]\n"
                "  pip install openkms-cli[parse]"
            )
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
                work_sub = out_base / ("_baidu_tmp" if use_baidu else "_office_tmp")
                if use_baidu:
                    try:
                        parse_path, hash_src = prepare_for_baidu_parse(fp.resolve(), work_sub)
                    except BaiduParseError as e:
                        console.print(f"[red]{fp}: {e}[/red]")
                        raise typer.Exit(1)
                else:
                    from openkms_cli.parse.office_convert import OfficeConvertError, prepare_for_vlm_parse

                    try:
                        parse_path, hash_src = prepare_for_vlm_parse(fp.resolve(), work_sub)
                    except OfficeConvertError as e:
                        console.print(f"[red]{fp}: {e}[/red]")
                        raise typer.Exit(1)

                ch_source = None if parse_path.resolve() == hash_src.resolve() else hash_src
                if use_baidu:

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
                else:
                    result, _, _ = run_parser(
                        input_path=parse_path,
                        output_dir=out_base,
                        vlm_url=vlm_runtime.base_url,
                        vlm_api_key=vlm_runtime.api_key,
                        model=vlm_runtime.model_name,
                        max_concurrency=vlm_runtime.max_concurrency,
                        content_hash_source=ch_source,
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
