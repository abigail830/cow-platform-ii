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


def _is_empty_meta_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, list) and len(value) == 0:
        return True
    return False


def _merge_metadata(db_meta: dict | None, sidecar: dict | None) -> Optional[dict[str, Any]]:
    """Field-level merge: keep non-empty DB values; fill blanks from sidecar."""
    if not db_meta and not sidecar:
        return None
    merged: dict[str, Any] = dict(db_meta or {})
    for key, value in (sidecar or {}).items():
        if _is_empty_meta_value(merged.get(key)) and not _is_empty_meta_value(value):
            merged[key] = value
    return merged or None


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


def _prepare_markdown_payload(
    text: str | None,
    *,
    markdown_s3_key: str,
    warnings: list[str],
) -> tuple[Optional[str], Optional[str]]:
    """Return (markdown_body, markdown_s3_key). Oversized MD is not truncated."""
    if not text:
        return None, None
    if len(text.encode("utf-8")) <= MAX_MARKDOWN_BYTES:
        return text, None
    warnings.append("markdown_via_s3")
    return None, markdown_s3_key


def _patch_job(
    base: str,
    job_id: str,
    headers: dict,
    basic,
    payload: dict[str, Any],
) -> None:
    try:
        requests.patch(
            f"{base}/internal-api/kb-import-jobs/{job_id}",
            json=payload,
            headers={**headers, "Content-Type": "application/json"},
            auth=basic,
            timeout=30,
        )
    except Exception as exc:
        console.print(f"[yellow]Failed to update job {job_id}: {exc}[/yellow]")


def _build_job_error_message(
    failure_notes: list[str],
    *,
    failed: int,
    completed: int,
) -> str | None:
    if not failure_notes:
        return None
    summary = "; ".join(failure_notes[:8])
    if len(failure_notes) > 8:
        summary += f" (+{len(failure_notes) - 8} more)"
    if failed and completed:
        return f"{failed} of {failed + completed} document(s) failed: {summary}"
    if failed:
        return f"All documents failed to import: {summary}"
    return summary


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
    completed = int(job.get("completed_count") or 0)
    failed = int(job.get("failed_count") or 0)
    failure_notes: list[str] = []

    def fail_job(message: str, *, status_failed: bool = True) -> None:
        payload: dict[str, Any] = {
            "error_message": message[:2000],
            "completed_count": completed,
            "failed_count": failed if failed else len(document_ids),
        }
        if status_failed:
            payload["status"] = "failed"
        _patch_job(base, job_id, auth_headers, basic, payload)

    if not document_ids:
        _patch_job(
            base,
            job_id,
            auth_headers,
            basic,
            {"status": "completed", "error_message": None},
        )
        console.print("[green]No documents to import[/green]")
        return

    try:
        try:
            s3_client = get_s3_client(
                cfg.aws_endpoint_url or None,
                cfg.aws_access_key_id,
                cfg.aws_secret_access_key,
                cfg.aws_region,
            )
        except typer.Exit:
            fail_job(
                "boto3 not installed. Install openkms-cli with pipeline or kb extras (boto3)."
            )
            raise

        bucket = cfg.aws_bucket_name

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
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
                    markdown_key = f"{prefix}/markdown.md"

                    markdown = _read_s3_text(s3_client, bucket, markdown_key)
                    page_index = _read_s3_json(s3_client, bucket, f"{prefix}/page_index.json")
                    parsing_result = _read_s3_json(s3_client, bucket, f"{prefix}/result.json")
                    extracted = _read_s3_json(s3_client, bucket, f"{prefix}/extracted_metadata.json")
                    metadata = _merge_metadata(ctx.get("metadata"), extracted)

                    if page_index and markdown:
                        try:
                            from openkms_cli.page_index.summarize import enrich_page_index_summaries

                            page_index = enrich_page_index_summaries(page_index, markdown)
                        except Exception as enrich_exc:
                            warnings.append(f"summary_enrich_failed:{enrich_exc}")

                    if metadata is None or not str(metadata.get("abstract") or "").strip():
                        warnings.append("abstract_missing")

                    markdown_body, markdown_s3_key = _prepare_markdown_payload(
                        markdown,
                        markdown_s3_key=markdown_key,
                        warnings=warnings,
                    )
                    if parsing_result:
                        parsing_result = _slim_parsing_result(parsing_result, warnings)

                    put_payload: dict[str, Any] = {
                        "document_name": ctx.get("name"),
                        "channel_path": ctx.get("channel_path"),
                        "original_s3_key": ctx.get("original_s3_key"),
                        "metadata": metadata,
                        "page_index": page_index,
                        "parsing_result": parsing_result,
                        "import_status": "completed",
                        "import_warnings": warnings or None,
                    }
                    if markdown_s3_key:
                        put_payload["markdown_s3_key"] = markdown_s3_key
                    else:
                        put_payload["markdown"] = markdown_body

                    put_resp = requests.put(
                        f"{base}/internal-api/knowledge-bases/{kb_id}/items/{document_id}",
                        headers={**auth_headers, "Content-Type": "application/json"},
                        auth=basic,
                        json=put_payload,
                        timeout=300,
                    )
                    if not put_resp.ok:
                        raise RuntimeError(f"PUT item {put_resp.status_code} {put_resp.text[:200]}")

                    completed += 1
                except Exception as e:
                    failed += 1
                    note = f"{document_id}: {e}"
                    failure_notes.append(note)
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

                _patch_job(
                    base,
                    job_id,
                    auth_headers,
                    basic,
                    {"completed_count": completed, "failed_count": failed},
                )
                progress.advance(task)

        final_status = "failed" if failed and completed == 0 else "completed"
        error_message = _build_job_error_message(
            failure_notes,
            failed=failed,
            completed=completed,
        )
        _patch_job(
            base,
            job_id,
            auth_headers,
            basic,
            {
                "status": final_status,
                "completed_count": completed,
                "failed_count": failed,
                "error_message": error_message,
            },
        )
        if final_status == "failed":
            console.print(f"[red]PageIndex import failed: {error_message}[/red]")
            raise typer.Exit(1)
        if failed:
            console.print(
                f"[yellow]PageIndex import finished with failures: {completed} completed, {failed} failed[/yellow]"
            )
        else:
            console.print(f"[green]PageIndex import done: {completed} completed[/green]")
    except typer.Exit:
        raise
    except Exception as e:
        fail_job(f"Import failed: {e}")
        console.print(f"[red]PageIndex import failed: {e}[/red]")
        raise typer.Exit(1) from e
