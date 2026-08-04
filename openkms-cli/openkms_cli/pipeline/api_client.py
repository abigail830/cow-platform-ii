"""Backend internal-api helpers for pipeline workers."""

import json
from pathlib import Path
from typing import Optional

import requests
import typer
from rich.console import Console

from openkms_cli.core.auth import auth_expired_response, try_api_request_auth
from openkms_cli.core.backend_defaults import fetch_cli_model_params
from openkms_cli.core.settings import get_cli_settings
from openkms_cli.pipeline.storage import get_s3_client

console = Console(stderr=True)


def resolve_api_request_auth(
    *, required: bool = False,
) -> tuple[dict[str, str], Optional[tuple[str, str]], bool]:
    cred = try_api_request_auth()
    if cred is None:
        if required:
            console.print("[red]API authentication required[/red]")
            raise typer.Exit(1)
        return {}, None, False
    auth_headers, basic_auth = cred
    return auth_headers, basic_auth, True


def persist_extracted_metadata_sidecar(
    extracted: dict,
    *,
    hash_dir: Path,
    prefix: str,
    skip_upload: bool,
    bucket: str,
    endpoint_url: Optional[str],
    access_key: str,
    secret_key: str,
    region: str,
) -> None:
    meta_path = hash_dir / "extracted_metadata.json"
    meta_path.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    if skip_upload:
        console.print("[dim]Wrote extracted_metadata.json (local only)[/dim]")
        return
    client = get_s3_client(endpoint_url, access_key, secret_key, region)
    client.put_object(
        Bucket=bucket,
        Key=f"{prefix}/extracted_metadata.json",
        Body=meta_path.read_bytes(),
        ContentType="application/json",
    )
    console.print("[dim]extracted_metadata.json uploaded to storage[/dim]")


def put_document_markdown(
    api_url: str,
    document_id: str,
    markdown: str,
    auth_headers: dict,
    basic: tuple[str, str] | None,
) -> tuple[bool, dict[str, str], Optional[tuple[str, str]]]:
    base = api_url.rstrip("/")
    url = f"{base}/internal-api/documents/{document_id}/markdown"
    payload = {"markdown": markdown}
    for attempt in range(2):
        headers = {**auth_headers, "Content-Type": "application/json"}
        r = requests.put(url, json=payload, headers=headers, auth=basic, timeout=300)
        if r.ok:
            console.print("[dim]Markdown synced to API[/dim]")
            return True, auth_headers, basic
        if attempt == 0 and auth_expired_response(r):
            cred = try_api_request_auth()
            if cred is not None:
                auth_headers, basic = cred
                continue
        console.print(f"[yellow]PUT markdown failed: {r.status_code} {r.text[:200]}[/yellow]")
        console.print(f"[dim]PUT {url}[/dim]")
        return False, auth_headers, basic
    return False, auth_headers, basic


def post_pipeline_version(
    api_url: str,
    document_id: str,
    auth_headers: dict,
    basic: tuple[str, str] | None,
) -> bool:
    base = api_url.rstrip("/")
    headers = {**auth_headers, "Content-Type": "application/json"}
    r = requests.post(
        f"{base}/internal-api/documents/{document_id}/versions",
        json={"tag": "Pipeline", "note": None},
        headers=headers,
        auth=basic,
        timeout=60,
    )
    if r.ok:
        console.print("[green]Pipeline version saved[/green]")
        return True
    console.print(f"[yellow]Save version failed: {r.status_code} {r.text[:200]}[/yellow]")
    return False


def cached_parse_usable(result: dict) -> bool:
    if not isinstance(result, dict) or not result:
        return False
    if result.get("document_kind") in ("spreadsheet", "mindmap"):
        return False
    if result.get("parsing_res_list") or result.get("layout_det_res"):
        return True
    if (result.get("markdown") or "").strip():
        return True
    return False


def load_cached_parse_from_storage(
    client,
    bucket: str,
    prefix: str,
    out_base: Path,
) -> tuple[dict, Path] | None:
    prefix = prefix.rstrip("/")
    rkey = f"{prefix}/result.json"
    try:
        raw = client.get_object(Bucket=bucket, Key=rkey)["Body"].read()
        result = json.loads(raw)
    except Exception:
        return None
    if not cached_parse_usable(result):
        return None
    markdown = (result.get("markdown") or "").strip()
    if not markdown:
        mkey = f"{prefix}/markdown.md"
        try:
            markdown = client.get_object(Bucket=bucket, Key=mkey)["Body"].read().decode("utf-8")
            result = {**result, "markdown": markdown}
        except Exception:
            markdown = ""
    file_hash = result.get("file_hash") or prefix.split("/")[-1]
    hash_dir = out_base / file_hash
    hash_dir.mkdir(parents=True, exist_ok=True)
    (hash_dir / "result.json").write_bytes(raw)
    if markdown:
        (hash_dir / "markdown.md").write_text(markdown, encoding="utf-8")
    return result, hash_dir


def document_metadata_needs_extraction_via_api(
    api_url: str,
    document_id: str,
    auth_headers: dict,
    basic_auth: tuple[str, str] | None,
) -> bool | None:
    base = api_url.rstrip("/")
    url = f"{base}/internal-api/documents/{document_id}/metadata-needs-extraction"
    for attempt in range(2):
        resp = requests.get(url, headers={**auth_headers}, auth=basic_auth, timeout=30)
        if resp.ok:
            body = resp.json()
            if isinstance(body.get("needs_extraction"), bool):
                return body["needs_extraction"]
            return None
        if attempt == 0 and auth_expired_response(resp):
            cred = try_api_request_auth()
            if cred is not None:
                auth_headers, basic_auth = cred
                continue
        break
    return None


def run_pipeline_metadata_extraction(
    *,
    result: dict,
    hash_dir: Path,
    prefix: str,
    extract_metadata: bool,
    document_id: str | None,
    metadata_extraction_config: dict | None = None,
    extraction_schema: str | None = None,
    extraction_model_id: str | None = None,
    extraction_model_name: str | None = None,
    extraction_model_base_url: str | None = None,
    extraction_api_key: str | None = None,
    api_url: str,
    skip_upload: bool,
    bucket: str,
    endpoint_url: Optional[str],
    access_key: str,
    secret_key: str,
    region: str,
    progress,
    task,
    auth_headers: dict,
    basic_auth: tuple[str, str] | None,
) -> tuple[dict, tuple[str, str] | None]:
    if not extract_metadata or not document_id or not result.get("markdown"):
        return auth_headers, basic_auth

    auth_headers, basic_auth, has_api_auth = resolve_api_request_auth(required=True)
    if not has_api_auth:
        return auth_headers, basic_auth

    needs_extraction = document_metadata_needs_extraction_via_api(
        api_url, document_id, auth_headers, basic_auth
    )
    if needs_extraction is False:
        console.print("[dim]Skipped metadata extraction: document metadata already has values[/dim]")
        return auth_headers, basic_auth
    if needs_extraction is None:
        console.print(
            "[yellow]Could not check document metadata via API; proceeding with extraction.[/yellow]"
        )

    progress.update(task, description="Extracting metadata...")
    schema_source = None
    system_prompt = ""
    user_prompt_template = ""
    model_id = extraction_model_id
    if metadata_extraction_config:
        schema_source = metadata_extraction_config.get("output_schema")
        system_prompt = metadata_extraction_config.get("system_prompt") or ""
        user_prompt_template = metadata_extraction_config.get("user_prompt_template") or ""
        model_id = metadata_extraction_config.get("model_config_id") or model_id

    try:
        if schema_source is not None:
            schema_data = schema_source if isinstance(schema_source, (dict, list)) else json.loads(
                extraction_schema or "[]"
            )
        else:
            schema_data = json.loads(extraction_schema or "[]")
    except json.JSONDecodeError as e:
        console.print(f"[red]Invalid extraction schema JSON: {e}[/red]")
        raise typer.Exit(1)

    try:
        from openkms_cli.parse.extract import extract_metadata_sync
    except ImportError:
        console.print("[yellow]Metadata extraction skipped: pip install openkms-cli[metadata][/yellow]")
        return auth_headers, basic_auth

    if extraction_model_base_url:
        cfg = get_cli_settings()
        model_config = {
            "base_url": extraction_model_base_url,
            "api_key": extraction_api_key or cfg.extraction_model_api_key or None,
            "model_name": extraction_model_name or "gpt-4",
        }
    elif model_id:
        cfg = get_cli_settings()
        data = fetch_cli_model_params(
            cfg,
            model_id=model_id,
            api_type="chat-completions",
        )
        if not data:
            console.print(
                f"[red]Failed to fetch extraction model via cli-params (model_id={model_id})[/red]"
            )
            raise typer.Exit(1)
        model_config = {
            "base_url": data.get("base_url"),
            "api_key": data.get("api_key"),
            "model_name": data.get("model_name"),
        }
    elif extraction_model_name:
        cfg = get_cli_settings()
        data = fetch_cli_model_params(
            cfg,
            model_name=extraction_model_name,
            api_type="chat-completions",
        )
        if not data:
            console.print(
                "[red]Failed to fetch extraction model via cli-params "
                f"(model_name={extraction_model_name})[/red]"
            )
            raise typer.Exit(1)
        model_config = {
            "base_url": data.get("base_url"),
            "api_key": data.get("api_key"),
            "model_name": data.get("model_name"),
        }
    else:
        console.print(
            "[red]Metadata extraction requires model_config_id in job snapshot "
            "or legacy --extraction-model-* flags[/red]"
        )
        raise typer.Exit(1)

    markdown = result.get("markdown") or ""
    if user_prompt_template.strip():
        prompt = user_prompt_template.replace("{markdown}", markdown)
    else:
        prompt = None

    extracted: dict | None = None
    try:
        extracted = extract_metadata_sync(
            markdown,
            model_config,
            schema_data,
            system_prompt=system_prompt,
            user_prompt=prompt,
        )
    except ValueError as e:
        console.print(f"[yellow]Metadata extraction failed: {e}[/yellow]")
        console.print(
            "[dim]Document parse finished; fix the extraction model (e.g. 502 from chat/completions) "
            "or use Extract on the document page when it is healthy.[/dim]"
        )

    if extracted is not None:
        persist_extracted_metadata_sidecar(
            extracted,
            hash_dir=hash_dir,
            prefix=prefix,
            skip_upload=skip_upload,
            bucket=bucket,
            endpoint_url=endpoint_url,
            access_key=access_key,
            secret_key=secret_key,
            region=region,
        )
        base = api_url.rstrip("/")
        put_url = f"{base}/internal-api/documents/{document_id}/metadata"
        headers = {**auth_headers, "Content-Type": "application/json"}
        resp = requests.put(
            put_url, json={"metadata": extracted}, headers=headers, auth=basic_auth, timeout=30
        )
        if not resp.ok:
            console.print(
                f"[yellow]PUT metadata failed: {resp.status_code} {resp.text[:200]}[/yellow]"
            )
            console.print(f"[dim]PUT {put_url}[/dim]")
            console.print("[dim]Metadata is on storage; the worker merges it when the job completes.[/dim]")
        else:
            console.print("[green]Metadata updated via API[/green]")

    return auth_headers, basic_auth
