"""RAG knowledge base indexing: S3 markdown → chunk → embed → backend chunks API."""

import hashlib
import json
import uuid
from typing import Any, Optional

import requests
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from openkms_cli.core.auth import try_api_request_auth
from openkms_cli.core.settings import get_cli_settings
from openkms_cli.kb.chunking import chunk_document, propagate_metadata
from openkms_cli.kb.embeddings import generate_embeddings
from openkms_cli.kb.locator import resolve_chunk_locator
from openkms_cli.kb.pageindex_import import _read_s3_text
from openkms_cli.pipeline.storage import get_s3_client

console = Console(stderr=True)

_CHUNK_UPLOAD_BATCH_SIZE = 50
_JOB_API = "/internal-api/kb-import-jobs"


def _job_api(base: str) -> str:
    return f"{base}{_JOB_API}"


def _load_kb_config(base: str, kb_id: str, headers: dict, basic) -> dict[str, Any]:
    resp = requests.get(
        f"{base}/internal-api/knowledge-bases/{kb_id}",
        headers=headers,
        auth=basic,
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(f"Failed to load KB config: {resp.status_code} {resp.text[:300]}")
    return resp.json()


def _load_embedding_credentials(
    base: str,
    kb_id: str,
    headers: dict,
    basic,
) -> dict[str, Any]:
    resp = requests.get(
        f"{base}/internal-api/models/kb-embedding-credentials",
        params={"knowledge_base_id": kb_id},
        headers=headers,
        auth=basic,
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(
            f"Failed to load embedding credentials: {resp.status_code} {resp.text[:300]}"
        )
    return resp.json()


def _upload_chunks(
    base: str,
    kb_id: str,
    items: list[dict[str, Any]],
    headers: dict,
    basic,
) -> None:
    for start in range(0, len(items), _CHUNK_UPLOAD_BATCH_SIZE):
        batch = items[start : start + _CHUNK_UPLOAD_BATCH_SIZE]
        resp = requests.post(
            f"{base}/internal-api/knowledge-bases/{kb_id}/chunks/batch",
            headers={**headers, "Content-Type": "application/json"},
            auth=basic,
            json={"items": batch},
            timeout=max(120, 60 + len(batch) * 4),
        )
        if not resp.ok:
            raise RuntimeError(
                f"Failed to upload chunks batch: {resp.status_code} {resp.text[:400]}"
            )


def _patch_job(
    base: str,
    job_id: str,
    headers: dict,
    basic,
    payload: dict[str, Any],
) -> None:
    try:
        requests.patch(
            f"{_job_api(base)}/{job_id}",
            json=payload,
            headers={**headers, "Content-Type": "application/json"},
            auth=basic,
            timeout=30,
        )
    except Exception as exc:
        console.print(f"[yellow]Failed to update job {job_id}: {exc}[/yellow]")


def _put_chunk_document(
    base: str,
    kb_id: str,
    document_id: str,
    headers: dict,
    basic,
    *,
    index_status: str,
    document_name: str | None = None,
    channel_path: str | None = None,
    index_error: str | None = None,
) -> None:
    payload: dict[str, Any] = {"index_status": index_status}
    if document_name is not None:
        payload["document_name"] = document_name
    if channel_path is not None:
        payload["channel_path"] = channel_path
    if index_error:
        payload["index_error"] = index_error[:500]
    try:
        requests.put(
            f"{base}/internal-api/knowledge-bases/{kb_id}/chunk-documents/{document_id}",
            headers={**headers, "Content-Type": "application/json"},
            auth=basic,
            json=payload,
            timeout=60,
        )
    except Exception as exc:
        console.print(
            f"[yellow]Failed to update chunk document {document_id}: {exc}[/yellow]"
        )


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
        return f"All documents failed to index: {summary}"
    return summary


def run_rag_index(job_id: str, api_url: Optional[str] = None) -> None:
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
        f"{_job_api(base)}/{job_id}",
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
        console.print("[green]No documents to index[/green]")
        return

    try:
        kb_config = _load_kb_config(base, kb_id, auth_headers, basic)
        chunk_config = kb_config.get("chunk_config") or {}
        metadata_keys = kb_config.get("metadata_keys") or []
        embed_cfg = _load_embedding_credentials(base, kb_id, auth_headers, basic)
        dimensions = int(embed_cfg.get("dimensions") or 1024)

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
            task = progress.add_task("Indexing...", total=len(document_ids))

            for document_id in document_ids:
                progress.update(task, description=f"Indexing document {document_id}...")
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
                    if not markdown or not markdown.strip():
                        raise RuntimeError("markdown.md missing or empty")

                    page_index_raw = _read_s3_text(s3_client, bucket, f"{prefix}/page_index.json")
                    page_index = None
                    if page_index_raw and page_index_raw.strip():
                        page_index = json.loads(page_index_raw)

                    doc_meta = propagate_metadata(ctx.get("metadata"), metadata_keys)
                    content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()

                    raw_chunks = chunk_document(markdown, chunk_config)
                    if not raw_chunks:
                        raise RuntimeError("No chunks produced from markdown")

                    batch_items: list[dict[str, Any]] = []
                    texts = [c["content"] for c in raw_chunks]
                    embeddings = generate_embeddings(texts, embed_cfg, dimensions=dimensions)

                    for rc, emb in zip(raw_chunks, embeddings):
                        chunk_metadata = dict(rc.get("metadata") or {})
                        locator = resolve_chunk_locator(markdown, chunk_metadata, page_index)
                        if locator:
                            chunk_metadata.update(locator)
                        batch_items.append({
                            "id": str(uuid.uuid4()),
                            "document_id": document_id,
                            "content": rc["content"],
                            "chunk_index": rc["chunk_index"],
                            "embedding": emb,
                            "chunk_metadata": chunk_metadata or None,
                            "doc_metadata": doc_meta,
                            "content_hash": content_hash,
                        })

                    del_resp = requests.delete(
                        f"{base}/internal-api/knowledge-bases/{kb_id}/documents/{document_id}/chunks",
                        headers=auth_headers,
                        auth=basic,
                        timeout=60,
                    )
                    if not del_resp.ok:
                        raise RuntimeError(f"DELETE chunks {del_resp.status_code}")

                    _upload_chunks(base, kb_id, batch_items, auth_headers, basic)
                    _put_chunk_document(
                        base,
                        kb_id,
                        document_id,
                        auth_headers,
                        basic,
                        index_status="indexed",
                        document_name=ctx.get("name"),
                        channel_path=ctx.get("channel_path"),
                    )
                    completed += 1
                except Exception as e:
                    failed += 1
                    note = f"{document_id}: {e}"
                    failure_notes.append(note)
                    console.print(f"[yellow]Document {document_id} failed: {e}[/yellow]")
                    _put_chunk_document(
                        base,
                        kb_id,
                        document_id,
                        auth_headers,
                        basic,
                        index_status="failed",
                        index_error=str(e),
                    )

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
            console.print(f"[red]RAG index failed: {error_message}[/red]")
            raise typer.Exit(1)
        if failed:
            console.print(
                f"[yellow]RAG index finished with failures: {completed} completed, {failed} failed[/yellow]"
            )
        else:
            console.print(f"[green]RAG index done: {completed} completed[/green]")
    except typer.Exit:
        raise
    except Exception as e:
        fail_job(f"Indexing failed: {e}")
        console.print(f"[red]RAG index failed: {e}[/red]")
        raise typer.Exit(1) from e
