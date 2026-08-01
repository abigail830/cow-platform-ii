"""PageIndex knowledge base import: S3 artifacts → backend kb_items."""

import json
from typing import Any, Optional

import requests
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from openkms_cli.core.auth import try_api_request_auth
from openkms_cli.core.settings import get_cli_settings
from openkms_cli.pipeline.storage import get_s3_client

console = Console(stderr=True)

MAX_MARKDOWN_BYTES = 4 * 1024 * 1024
MAX_PARSING_RESULT_BYTES = 4 * 1024 * 1024


def _read_s3_text(client, bucket: str, key: str) -> Optional[str]:
    try:
        raw = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        return raw.decode("utf-8")
    except client.exceptions.NoSuchKey:
        return None
    except Exception as e:
        if "404" in str(e) or "NoSuchKey" in str(e):
            return None
        raise


def _read_s3_json(client, bucket: str, key: str) -> Optional[dict[str, Any]]:
    text = _read_s3_text(client, bucket, key)
    if not text:
        return None
    return json.loads(text)


def _merge_metadata(db_meta: dict | None, sidecar: dict | None) -> Optional[dict[str, Any]]:
    db_values = list((db_meta or {}).values())
    if db_values and not all(
        v is None or v == "" or (isinstance(v, list) and len(v) == 0) for v in db_values
    ):
        return db_meta
    if sidecar:
        return sidecar
    if db_meta:
        return db_meta
    return None


def _slim_parsing_result(data: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    raw = json.dumps(data, ensure_ascii=False)
    if len(raw.encode("utf-8")) <= MAX_PARSING_RESULT_BYTES:
        return data
    warnings.append("parsing_result_slimmed")
    slim = {
        "file_hash": data.get("file_hash"),
        "parser": data.get("parser"),
        "document_kind": data.get("document_kind"),
        "page_count": data.get("page_count"),
        "format": data.get("format"),
        "sheets": data.get("sheets"),
    }
    return {k: v for k, v in slim.items() if v is not None}


def _trim_markdown(text: str | None, warnings: list[str]) -> str | None:
    if not text:
        return None
    encoded = text.encode("utf-8")
    if len(encoded) <= MAX_MARKDOWN_BYTES:
        return text
    warnings.append("markdown_truncated")
    return encoded[:MAX_MARKDOWN_BYTES].decode("utf-8", errors="ignore")


def run_pageindex_import(job_id: str, api_url: Optional[str] = None) -> None:
    cfg = get_cli_settings()
    base = (api_url or cfg.openkms_api_url or "").rstrip("/")
    if not base:
        console.print("[red]--api-url or OPENKMS_API_URL is required[/red]")
        raise typer.Exit(1)

    cred = try_api_request_auth()
    if cred is None:
        console.print("[red]API authentication required[/red]")
        raise typer.Exit(1)
    auth_headers, basic = cred

    job_resp = requests.get(
        f"{base}/internal-api/kb-pageindex-import-jobs/{job_id}",
        headers=auth_headers,
        auth=basic,
        timeout=60,
    )
    if not job_resp.ok:
        console.print(f"[red]Failed to load job: {job_resp.status_code} {job_resp.text[:300]}[/red]")
        raise typer.Exit(1)

    job = job_resp.json()
    kb_id = job["knowledge_base_id"]
    document_ids = job.get("document_ids") or []
    if not document_ids:
        requests.patch(
            f"{base}/internal-api/kb-pageindex-import-jobs/{job_id}",
            json={"status": "completed"},
            headers={**auth_headers, "Content-Type": "application/json"},
            auth=basic,
            timeout=30,
        )
        console.print("[green]No documents to import[/green]")
        return

    s3_client = get_s3_client(
        cfg.aws_endpoint_url or None,
        cfg.aws_access_key_id,
        cfg.aws_secret_access_key,
        cfg.aws_region,
    )
    bucket = cfg.aws_bucket_name

    completed = int(job.get("completed_count") or 0)
    failed = int(job.get("failed_count") or 0)

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task("Importing...", total=len(document_ids))

        for document_id in document_ids:
            progress.update(task, description=f"Importing document {document_id}...")
            warnings: list[str] = []
            try:
                ctx_resp = requests.get(
                    f"{base}/internal-api/documents/{document_id}/import-context",
                    headers=auth_headers,
                    auth=basic,
                    timeout=60,
                )
                if not ctx_resp.ok:
                    raise RuntimeError(f"import-context {ctx_resp.status_code}")

                ctx = ctx_resp.json()
                prefix = ctx["s3_prefix"]

                markdown = _read_s3_text(s3_client, bucket, f"{prefix}/markdown.md")
                page_index = _read_s3_json(s3_client, bucket, f"{prefix}/page_index.json")
                parsing_result = _read_s3_json(s3_client, bucket, f"{prefix}/result.json")
                extracted = _read_s3_json(s3_client, bucket, f"{prefix}/extracted_metadata.json")
                metadata = _merge_metadata(ctx.get("metadata"), extracted)

                markdown = _trim_markdown(markdown, warnings)
                if parsing_result:
                    parsing_result = _slim_parsing_result(parsing_result, warnings)

                put_resp = requests.put(
                    f"{base}/internal-api/knowledge-bases/{kb_id}/items/{document_id}",
                    headers={**auth_headers, "Content-Type": "application/json"},
                    auth=basic,
                    json={
                        "document_name": ctx.get("name"),
                        "channel_path": ctx.get("channel_path"),
                        "original_s3_key": ctx.get("original_s3_key"),
                        "metadata": metadata,
                        "page_index": page_index,
                        "markdown": markdown,
                        "parsing_result": parsing_result,
                        "import_status": "completed",
                        "import_warnings": warnings or None,
                    },
                    timeout=300,
                )
                if not put_resp.ok:
                    raise RuntimeError(f"PUT item {put_resp.status_code} {put_resp.text[:200]}")

                completed += 1
            except Exception as e:
                failed += 1
                console.print(f"[yellow]Document {document_id} failed: {e}[/yellow]")
                try:
                    requests.put(
                        f"{base}/internal-api/knowledge-bases/{kb_id}/items/{document_id}",
                        headers={**auth_headers, "Content-Type": "application/json"},
                        auth=basic,
                        json={
                            "import_status": "failed",
                            "import_error": str(e)[:500],
                        },
                        timeout=60,
                    )
                except Exception:
                    pass

            requests.patch(
                f"{base}/internal-api/kb-pageindex-import-jobs/{job_id}",
                json={"completed_count": completed, "failed_count": failed},
                headers={**auth_headers, "Content-Type": "application/json"},
                auth=basic,
                timeout=30,
            )
            progress.advance(task)

    final_status = "failed" if failed and completed == 0 else "completed"
    requests.patch(
        f"{base}/internal-api/kb-pageindex-import-jobs/{job_id}",
        json={
            "status": final_status,
            "completed_count": completed,
            "failed_count": failed,
            "error_message": None if final_status == "completed" else "All documents failed to import",
        },
        headers={**auth_headers, "Content-Type": "application/json"},
        auth=basic,
        timeout=30,
    )
    console.print(
        f"[green]PageIndex import done: {completed} completed, {failed} failed[/green]"
    )
