"""RAG knowledge base indexing: S3 markdown → chunk → embed → backend chunks API."""

import hashlib
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
    if not document_ids:
        requests.patch(
            f"{_job_api(base)}/{job_id}",
            json={"status": "completed"},
            headers={**auth_headers, "Content-Type": "application/json"},
            auth=basic,
            timeout=30,
        )
        console.print("[green]No documents to index[/green]")
        return

    kb_config = _load_kb_config(base, kb_id, auth_headers, basic)
    chunk_config = kb_config.get("chunk_config") or {}
    metadata_keys = kb_config.get("metadata_keys") or []
    embed_cfg = _load_embedding_credentials(base, kb_id, auth_headers, basic)
    dimensions = int(embed_cfg.get("dimensions") or 1024)

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

                doc_meta = propagate_metadata(ctx.get("metadata"), metadata_keys)
                content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()

                raw_chunks = chunk_document(markdown, chunk_config)
                if not raw_chunks:
                    raise RuntimeError("No chunks produced from markdown")

                batch_items: list[dict[str, Any]] = []
                texts = [c["content"] for c in raw_chunks]
                embeddings = generate_embeddings(texts, embed_cfg, dimensions=dimensions)

                for rc, emb in zip(raw_chunks, embeddings):
                    batch_items.append({
                        "id": str(uuid.uuid4()),
                        "document_id": document_id,
                        "content": rc["content"],
                        "chunk_index": rc["chunk_index"],
                        "embedding": emb,
                        "chunk_metadata": rc.get("metadata"),
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
                completed += 1
            except Exception as e:
                failed += 1
                console.print(f"[yellow]Document {document_id} failed: {e}[/yellow]")

            requests.patch(
                f"{_job_api(base)}/{job_id}",
                json={"completed_count": completed, "failed_count": failed},
                headers={**auth_headers, "Content-Type": "application/json"},
                auth=basic,
                timeout=30,
            )
            progress.advance(task)

    final_status = "failed" if failed and completed == 0 else "completed"
    requests.patch(
        f"{_job_api(base)}/{job_id}",
        json={
            "status": final_status,
            "completed_count": completed,
            "failed_count": failed,
            "error_message": None if final_status == "completed" else "All documents failed to index",
        },
        headers={**auth_headers, "Content-Type": "application/json"},
        auth=basic,
        timeout=30,
    )
    console.print(f"[green]RAG index done: {completed} completed, {failed} failed[/green]")
