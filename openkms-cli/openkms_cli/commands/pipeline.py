"""Pipeline CLI: run document parsing pipeline."""

import json
import traceback
from pathlib import Path
from typing import Optional

import requests
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from openkms_cli.core.auth import try_api_request_auth
from openkms_cli.core.settings import get_cli_settings
from openkms_cli.ingest import is_native_ingest, resolve_ingest_kind, run_native_ingest
from openkms_cli.pipeline.api_client import (
    load_cached_parse_from_storage,
    post_pipeline_version,
    put_document_markdown,
    resolve_api_request_auth,
    run_pipeline_metadata_extraction,
)
from openkms_cli.pipeline.post_ingest import (
    build_page_index,
    ensure_original_upload_artifact,
    layouts_from_result,
    original_basename_from_path,
    write_hash_dir_artifacts,
)
from openkms_cli.pipeline.storage import (
    content_type_for_path,
    get_s3_client,
    is_s3_uri,
    parse_s3_uri,
)

console = Console(stderr=True)

SUPPORTED_PIPELINES: dict[str, tuple[str, str]] = {
    "paddleocr-doc-parse": (
        "PaddleOCR Document Parse (Baidu API)",
        "Deprecated alias: same Baidu Cloud PaddleOCR-VL API as baidu-doc-parse.",
    ),
    "baidu-doc-parse": (
        "Baidu Cloud Document Parse",
        "Parse via Baidu PaddleOCR-VL API (BOS presigned file_url); async job stages.",
    ),
    "aliyun-docmind-parse": (
        "Aliyun Document Mind Parse",
        "Parse via Aliyun Document Mind (大模型版) with presigned OSS FileUrl; async job stages.",
    ),
    "kb-index": (
        "Knowledge Base Index",
        "Chunk documents, generate embeddings, index FAQs; requires --knowledge-base-id.",
    ),
}

pipeline_app = typer.Typer(
    help="Run document parsing pipeline (download from S3 → parse → upload to S3)",
)

@pipeline_app.command("list")
def pipeline_list() -> None:
    """List supported pipelines that can be run with `pipeline run`."""
    table = Table(title="Supported Pipelines")
    table.add_column("Pipeline Name", style="cyan", no_wrap=True)
    table.add_column("Description", style="dim")
    for name, (display, desc) in SUPPORTED_PIPELINES.items():
        table.add_row(name, f"{display}: {desc}")
    console.print(table)
    console.print(
        "\n[dim]Doc parse (Baidu Cloud API): pipeline run --pipeline-name baidu-doc-parse "
        "(or deprecated paddleocr-doc-parse) --input <uri> --s3-prefix <prefix>[/dim]"
    )
    console.print(
        "[dim]Async cloud jobs: pipeline run-async --job-id <id> (baidu / aliyun)[/dim]"
    )
    console.print("[dim]KB index:  pipeline run --pipeline-name kb-index --knowledge-base-id <id> [--wiki-space-id <id>] --api-url <url>[/dim]")


@pipeline_app.command("run")
def pipeline_run(
    pipeline_name: str = typer.Option(
        "paddleocr-doc-parse",
        "--pipeline-name",
        help="Pipeline name (e.g. paddleocr-doc-parse, kb-index)",
    ),
    input_uri: Optional[str] = typer.Option(
        None,
        "--input",
        help="Input: S3 URI or local file path (required for doc-parse pipelines)",
    ),
    knowledge_base_id: Optional[str] = typer.Option(
        None,
        "--knowledge-base-id",
        help="Knowledge base ID to index (required for kb-index pipeline)",
    ),
    wiki_space_id: Optional[str] = typer.Option(
        None,
        "--wiki-space-id",
        help="When set with kb-index, re-index only this linked wiki space (one page per chunk)",
    ),
    s3_prefix: Optional[str] = typer.Option(
        None,
        "--s3-prefix",
        help="S3 output prefix. If omitted with S3 input, uses file hash (SHA256 of content).",
    ),
    vlm_url: Optional[str] = typer.Option(
        None,
        "--vlm-url",
        help="VLM server URL (default: OPENKMS_VLM_URL from environment)",
    ),
    vlm_api_key: Optional[str] = typer.Option(
        None,
        "--vlm-api-key",
        help="VLM API key (overrides OPENKMS_VLM_API_KEY)",
    ),
    vlm_model: Optional[str] = typer.Option(
        None,
        "--model",
        help="VLM API model id (overrides OPENKMS_VLM_MODEL; standalone with --vlm-url)",
    ),
    vlm_max_concurrency: Optional[int] = typer.Option(
        None,
        "--max-concurrency",
        help="Max concurrent VLM requests (default: OPENKMS_VLM_MAX_CONCURRENCY)",
    ),
    vlm_config_name: Optional[str] = typer.Option(
        None,
        "--vlm-config-name",
        help="Model config display name; fetches connection info from backend when set",
    ),
    vlm_config_path: Optional[Path] = typer.Option(
        None,
        "--vlm-config",
        "-c",
        path_type=Path,
        exists=True,
        help="JSON file with vlm_url, model, vlm_api_key, max_concurrency, vlm_config_name",
    ),
    bucket: Optional[str] = typer.Option(
        None,
        "--bucket",
        help="S3 bucket (default: AWS_BUCKET_NAME)",
    ),
    endpoint_url: Optional[str] = typer.Option(
        None,
        "--endpoint-url",
        help="S3/MinIO endpoint (default: AWS_ENDPOINT_URL)",
    ),
    region: Optional[str] = typer.Option(
        None,
        "--region",
        help="AWS region (default: AWS_REGION)",
    ),
    output_dir: Path = typer.Option(
        Path("output"),
        "--output-dir",
        "-o",
        path_type=Path,
        help="Local directory for temp files before upload (default: ./output)",
    ),
    skip_upload: bool = typer.Option(
        False,
        "--skip-upload",
        help="Parse only; do not upload to S3 (no AWS credentials needed for upload)",
    ),
    extract_metadata: bool = typer.Option(
        False,
        "--extract-metadata",
        help="After upload, extract metadata via LLM and PUT to backend API",
    ),
    build_page_index: bool = typer.Option(
        True,
        "--build-page-index/--no-build-page-index",
        help="Build page_index.json after parse",
    ),
    page_index_strategy: Optional[str] = typer.Option(
        None,
        "--page-index-strategy",
        help="page_index builder: markdown-headings | aliyun-layouts (default: by pipeline provider)",
    ),
    document_id: Optional[str] = typer.Option(
        None,
        "--document-id",
        help="Document ID: sync markdown + save Pipeline version after upload (OIDC-authenticated API); required for --extract-metadata",
    ),
    api_url: Optional[str] = typer.Option(
        None,
        "--api-url",
        help="Backend API URL (default: OPENKMS_API_URL)",
    ),
    extraction_schema: Optional[str] = typer.Option(
        None,
        "--extraction-schema",
        help="Extraction schema as JSON string (required for --extract-metadata)",
    ),
    extraction_model_base_url: Optional[str] = typer.Option(
        None,
        "--extraction-model-base-url",
        help="LLM base URL (when not using --extraction-model-name)",
    ),
    extraction_model_name: Optional[str] = typer.Option(
        None,
        "--extraction-model-name",
        help="LLM model name (e.g. qwen3.5); used with --extraction-model-base-url or for cli-params lookup",
    ),
    extraction_api_key: Optional[str] = typer.Option(
        None,
        "--extraction-api-key",
        help="LLM API key (when using --extraction-model-base-url)",
    ),
    baidu_poll_interval: int = typer.Option(
        8,
        "--baidu-poll-interval",
        help="Seconds between Baidu task status polls (baidu-doc-parse)",
    ),
    baidu_max_wait: int = typer.Option(
        600,
        "--baidu-max-wait",
        help="Max seconds to wait for Baidu parse task (baidu-doc-parse)",
    ),
) -> None:
    """
    Run pipeline. Use `pipeline list` to see supported pipeline names.

    Document parse example:
      openkms-cli pipeline run --pipeline-name paddleocr-doc-parse \\
        --input s3://openkms/da46.../original.pdf --s3-prefix da46...

    Baidu Cloud document parse (no local VLM):
      openkms-cli pipeline run --pipeline-name baidu-doc-parse \\
        --input ./doc.pdf --s3-prefix da46...

    KB index example:
      openkms-cli pipeline run --pipeline-name kb-index --knowledge-base-id <id> --api-url ...
    """
    if pipeline_name not in SUPPORTED_PIPELINES:
        console.print(
            f"[yellow]Unknown pipeline '{pipeline_name}'. "
            f"Use 'openkms-cli pipeline list' to see supported pipelines.[/yellow]"
        )
        raise typer.Exit(1)

    cfg = get_cli_settings()
    if bucket is None:
        bucket = cfg.aws_bucket_name
    if endpoint_url is None:
        endpoint_url = cfg.aws_endpoint_url or None
    if region is None:
        region = cfg.aws_region
    if api_url is None:
        api_url = cfg.openkms_api_url

    # --- kb-index pipeline ---
    if pipeline_name == "kb-index":
        if not knowledge_base_id:
            console.print("[red]kb-index pipeline requires --knowledge-base-id[/red]")
            raise typer.Exit(1)
        try:
            if wiki_space_id:
                from openkms_cli.kb.indexer import run_wiki_space_indexer as _run_kb_index
            else:
                from openkms_cli.kb.indexer import run_indexer as _run_kb_index
        except ImportError as e:
            console.print(f"[red]Missing dependencies: {e}. Install with: pip install openkms-cli[kb][/red]")
            raise typer.Exit(1)

        auth_headers: dict = {}
        basic_auth: Optional[tuple[str, str]] = None
        try:
            from openkms_cli.core.auth import try_api_request_auth

            cred = try_api_request_auth()
            if cred:
                auth_headers, basic_auth = cred
                console.print("[dim]Using API authentication[/dim]")
        except Exception:
            console.print("[yellow]No API auth (proceeding without auth)[/yellow]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task(
                "Indexing wiki space..." if wiki_space_id else "Indexing knowledge base...",
                total=None,
            )
            try:
                run_kwargs: dict = {
                    "knowledge_base_id": knowledge_base_id,
                    "api_url": api_url,
                    "auth_headers": auth_headers,
                    "basic": basic_auth,
                    "progress": progress,
                    "task": task,
                    "output_dir": output_dir,
                }
                if wiki_space_id:
                    run_kwargs["wiki_space_id"] = wiki_space_id
                stats = _run_kb_index(**run_kwargs)
                progress.update(task, description="Done!")
                console.print(
                    f"[green]Indexing complete: "
                    f"{stats['chunks_created']} chunks, "
                    f"{stats['faqs_indexed']} FAQs indexed[/green]"
                )
            except Exception as e:
                console.print(f"[red]Indexing failed: {e}[/red]")
                console.print("[dim]Traceback:[/dim]")
                console.print(traceback.format_exc(), style="dim")
                raise typer.Exit(1)
        return

    # --- doc-parse pipelines (Baidu Cloud API; paddleocr-doc-parse is deprecated alias) ---
    use_baidu = pipeline_name in ("baidu-doc-parse", "paddleocr-doc-parse")
    if pipeline_name == "paddleocr-doc-parse":
        console.print(
            "[yellow]pipeline-name paddleocr-doc-parse is deprecated; "
            "use baidu-doc-parse (same Baidu Cloud API).[/yellow]"
        )

    if use_baidu:
        if not cfg.baidu_cloud_api_key or not cfg.baidu_cloud_secret_key:
            console.print(
                "[red]Baidu doc-parse requires OPENKMS_BAIDU_CLOUD_API_KEY and "
                "OPENKMS_BAIDU_CLOUD_SECRET_KEY[/red]"
            )
            raise typer.Exit(1)
    elif pipeline_name != "aliyun-docmind-parse":
        console.print(f"[red]Unsupported doc-parse pipeline: {pipeline_name}[/red]")
        raise typer.Exit(1)

    if not input_uri:
        console.print("[red]Document parse pipelines require --input (S3 URI or local file)[/red]")
        raise typer.Exit(1)

    auth_headers: dict = {}
    basic_auth: Optional[tuple[str, str]] = None
    has_api_auth = False
    if extract_metadata:
        if not document_id or not extraction_schema:
            console.print(
                "[red]--extract-metadata requires --document-id and --extraction-schema[/red]"
            )
            raise typer.Exit(1)
        if not extraction_model_name and not extraction_model_base_url:
            console.print(
                "[red]--extract-metadata requires --extraction-model-name or "
                "--extraction-model-base-url[/red]"
            )
            raise typer.Exit(1)
    if document_id:
        auth_headers, basic_auth, has_api_auth = resolve_api_request_auth(required=extract_metadata)
        if has_api_auth:
            console.print("[dim]Using API authentication[/dim]")
        elif not extract_metadata:
            console.print("[yellow]No API auth; skipping markdown sync and pipeline version.[/yellow]")

    access_key = cfg.aws_access_key_id
    secret_key = cfg.aws_secret_access_key

    is_local = not is_s3_uri(input_uri)
    work = output_dir.resolve() / "_pipeline_work"
    work.mkdir(parents=True, exist_ok=True)

    if is_local:
        stored_path = Path(input_uri)
        if not stored_path.is_file():
            console.print(f"[red]Local file not found: {stored_path}[/red]")
            raise typer.Exit(1)
        stored_path = stored_path.resolve()
        content = stored_path.read_bytes()
        console.print(f"[dim]Input: {stored_path}[/dim] (local, skip download)")
    else:
        if not access_key or not secret_key:
            console.print("[red]AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required for S3[/red]")
            raise typer.Exit(1)
        try:
            input_bucket, input_key = parse_s3_uri(input_uri)
        except typer.BadParameter as e:
            console.print(f"[red]{e}[/red]")
            raise typer.Exit(1)
        ext_part = Path(input_key).suffix.lower().lstrip(".") or "bin"
        stored_path = work / f"input.{ext_part}"
        content = get_s3_client(endpoint_url, access_key, secret_key, region).get_object(
            Bucket=input_bucket, Key=input_key
        )["Body"].read()
        stored_path.write_bytes(content)
        console.print(f"[dim]Input: s3://{input_bucket}/{input_key}[/dim]")

    ingest_kind = resolve_ingest_kind(suffix=stored_path.suffix)

    try:
        from openkms_cli.providers.baidu.parser import BaiduParseError
        from openkms_cli.parse.input_prepare import InputPrepareError

        if use_baidu:
            from openkms_cli.providers.baidu.parser import prepare_for_baidu_parse
        elif pipeline_name == "aliyun-docmind-parse":
            console.print("[red]aliyun-docmind-parse requires async pipeline run-async, not pipeline run[/red]")
            raise typer.Exit(1)
    except ImportError:
        console.print("[red]Required parser module missing[/red]")
        raise typer.Exit(1)

    parse_path = stored_path
    hash_src = stored_path
    ch_source = None
    if not is_native_ingest(ingest_kind):
        try:
            if use_baidu:
                parse_path, hash_src = prepare_for_baidu_parse(stored_path, work / "baidu_stage")
        except (InputPrepareError, BaiduParseError) as e:
            console.print(f"[red]{e}[/red]")
            raise typer.Exit(1)
        ch_source = None if parse_path.resolve() == hash_src.resolve() else hash_src

    baidu_auth_headers: dict[str, str] = {}
    baidu_basic_auth: Optional[tuple[str, str]] = None
    if use_baidu and document_id:
        baidu_auth_headers, baidu_basic_auth, _ = resolve_api_request_auth(required=False)

    if not skip_upload and (not access_key or not secret_key):
        console.print("[red]AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required for upload[/red]")
        raise typer.Exit(1)

    out_base = output_dir.resolve() / "parsed"
    out_base.mkdir(parents=True, exist_ok=True)
    if skip_upload:
        console.print(f"[dim]Output: {out_base}/ (local only, skip upload)[/dim]")
    else:
        prefix_hint = s3_prefix.rstrip("/") if s3_prefix else "<file_hash>"
        console.print(f"[dim]Output: s3://{bucket}/{prefix_hint}/[/dim]")
    console.print(f"[dim]Local temp: {output_dir.resolve()}[/dim]")

    storage_prefix = s3_prefix.rstrip("/") if s3_prefix else None
    s3_client = None
    parsed_from_cache = False
    result: dict | None = None
    hash_dir: Path | None = None
    prefix: str | None = storage_prefix

    if not skip_upload and storage_prefix and access_key and secret_key:
        s3_client = get_s3_client(endpoint_url, access_key, secret_key, region)
        cached = load_cached_parse_from_storage(s3_client, bucket, storage_prefix, out_base)
        if cached is not None:
            result, hash_dir = cached
            parsed_from_cache = True

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Parsing...", total=None)

        if parsed_from_cache and result is not None and hash_dir is not None:
            progress.update(task, description="Reusing cached parse on storage...")
            console.print(f"[dim]Skipped parse: reusing s3://{bucket}/{prefix}/[/dim]")
        else:
            try:
                if is_native_ingest(ingest_kind):
                    progress.update(task, description=f"Ingesting {ingest_kind.value}...")
                    result, hash_dir = run_native_ingest(
                        kind=ingest_kind,
                        stored_input=stored_path,
                        original_content=content,
                        out_base=out_base,
                    )
                    prefix = storage_prefix or result["file_hash"]
                elif use_baidu:
                    from openkms_cli.providers.baidu.parser import run_baidu_parser

                    def _baidu_status(status: str) -> None:
                        progress.update(task, description=f"Baidu parse: {status}...")

                    fetch_ext = (
                        parse_path.suffix.lower().lstrip(".")
                        if parse_path.resolve() != stored_path.resolve()
                        else stored_path.suffix.lower().lstrip(".")
                    ) or "bin"
                    result, _, _ = run_baidu_parser(
                        input_path=parse_path,
                        output_dir=out_base,
                        api_key=cfg.baidu_cloud_api_key,
                        secret_key=cfg.baidu_cloud_secret_key,
                        content_hash_source=ch_source,
                        document_id=document_id,
                        original_file_ext=fetch_ext,
                        poll_interval=baidu_poll_interval,
                        max_wait=baidu_max_wait,
                        on_status=_baidu_status,
                    )
            except ImportError:
                console.print("[red]Parser not available. pip install openkms-cli (requests)[/red]")
                raise typer.Exit(1)
            except BaiduParseError as e:
                console.print(f"[red]Baidu parse failed: {e}[/red]")
                raise typer.Exit(1)
            except requests.exceptions.RequestException as e:
                console.print(f"[red]Baidu parse failed: network error ({e})[/red]")
                raise typer.Exit(1)

            if not is_native_ingest(ingest_kind):
                file_hash = result["file_hash"]
                hash_dir = out_base / file_hash
                prefix = storage_prefix or file_hash

                write_hash_dir_artifacts(
                    hash_dir=hash_dir,
                    result=result,
                    original_content=Path(hash_src).read_bytes(),
                    original_basename=original_basename_from_path(hash_src),
                )
            else:
                ensure_original_upload_artifact(
                    hash_dir,
                    basename=original_basename_from_path(stored_path),
                    content=content,
                )

            if build_page_index and result.get("markdown"):
                try:
                    provider = None
                    if not is_native_ingest(ingest_kind):
                        if pipeline_name in ("baidu-doc-parse", "paddleocr-doc-parse"):
                            provider = "baidu"
                        elif pipeline_name == "aliyun-docmind-parse":
                            provider = "aliyun"

                    progress.update(task, description="Building PageIndex...")
                    build_page_index(
                        hash_dir,
                        ingest_kind=ingest_kind,
                        provider=provider,
                        layouts=layouts_from_result(result),
                        page_index_strategy=page_index_strategy,
                        doc_name=Path(hash_src).stem,
                    )
                except Exception as e:
                    console.print(f"[yellow]PageIndex build failed: {e}. Skipping.[/yellow]")

            if skip_upload:
                count = sum(1 for f in hash_dir.rglob("*") if f.is_file())
                console.print(f"[green]Pipeline done. {count} files in {hash_dir}[/green]")
            else:
                progress.update(task, description="Uploading to S3...")
                upload_client = s3_client or get_s3_client(endpoint_url, access_key, secret_key, region)
                key_base = prefix
                count = 0
                for f in hash_dir.rglob("*"):
                    if f.is_file():
                        rel = f.relative_to(hash_dir).as_posix()
                        key = f"{key_base}/{rel}"
                        ct = content_type_for_path(rel)
                        upload_client.put_object(
                            Bucket=bucket,
                            Key=key,
                            Body=f.read_bytes(),
                            ContentType=ct,
                        )
                        count += 1
                console.print(
                    f"[green]Uploaded {count} files to s3://{bucket}/{prefix}/[/green]"
                )

        assert result is not None and hash_dir is not None and prefix is not None

        has_api_auth = False
        markdown_synced = False
        if not skip_upload and document_id and result.get("markdown"):
            auth_headers, basic_auth, has_api_auth = resolve_api_request_auth(required=extract_metadata)
            if has_api_auth:
                progress.update(task, description="Syncing markdown to API...")
                markdown_synced, auth_headers, basic_auth = put_document_markdown(
                    api_url, document_id, result["markdown"], auth_headers, basic_auth
                )

        auth_headers, basic_auth = run_pipeline_metadata_extraction(
            result=result,
            hash_dir=hash_dir,
            prefix=prefix,
            extract_metadata=extract_metadata,
            document_id=document_id,
            extraction_schema=extraction_schema,
            extraction_model_name=extraction_model_name,
            extraction_model_base_url=extraction_model_base_url,
            extraction_api_key=extraction_api_key,
            api_url=api_url,
            skip_upload=skip_upload,
            bucket=bucket,
            endpoint_url=endpoint_url,
            access_key=access_key,
            secret_key=secret_key,
            region=region,
            progress=progress,
            task=task,
            auth_headers=auth_headers,
            basic_auth=basic_auth,
        )

        if (
            not skip_upload
            and document_id
            and has_api_auth
            and result.get("markdown")
            and markdown_synced
        ):
            progress.update(task, description="Saving pipeline version...")
            post_pipeline_version(api_url, document_id, auth_headers, basic_auth)


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
    """Run metadata extraction for a parsed async job."""
    from openkms_cli.pipeline.async_jobs import extract_metadata_job

    extract_metadata_job(job_id, api_url)
