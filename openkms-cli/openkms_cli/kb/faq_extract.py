"""FAQ extract: document markdown → draft FAQ rows via LLM."""

import json
import re
from typing import Any, Optional

import requests
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from openkms_cli.core.auth import try_api_request_auth
from openkms_cli.core.settings import get_cli_settings
from openkms_cli.kb.chunking import propagate_metadata
from openkms_cli.kb.pageindex_import import _read_s3_text
from openkms_cli.kb.rag_index import _build_job_error_message, _load_kb_config, _patch_job
from openkms_cli.pipeline.storage import get_s3_client

console = Console(stderr=True)
_JOB_API = "/internal-api/kb-import-jobs"


def _job_api(base: str) -> str:
    return f"{base}{_JOB_API}"


def _apply_template(template: str, vars: dict[str, str]) -> str:
    out = template
    for key, value in vars.items():
        out = out.replace(f"{{{key}}}", value)
    return out


def _chat_extract(
    base: str,
    model_id: str,
    prompt: str,
    headers: dict,
    basic,
) -> list[dict[str, str]]:
    params_resp = requests.get(
        f"{base}/internal-api/models/cli-params",
        params={"model_id": model_id, "api_type": "chat-completions"},
        headers=headers,
        auth=basic,
        timeout=60,
    )
    if not params_resp.ok:
        raise RuntimeError(f"cli-params {params_resp.status_code}")

    params = params_resp.json()
    url = f"{params['base_url'].rstrip('/')}/chat/completions"
    resp = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {params['api_key']}",
        },
        json={
            "model": params["model_name"],
            "messages": [
                {
                    "role": "system",
                    "content": "Extract FAQ pairs. Respond with valid JSON array only.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        },
        timeout=180,
    )
    if not resp.ok:
        raise RuntimeError(f"chat {resp.status_code} {resp.text[:300]}")

    data = resp.json()
    raw = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
    raw = re.sub(r"^```json\s*", "", raw, flags=re.I)
    raw = re.sub(r"^```\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise RuntimeError("Extraction response must be a JSON array")

    items: list[dict[str, str]] = []
    for row in parsed:
        if not isinstance(row, dict):
            continue
        question = str(row.get("question", "")).strip()
        answer = str(row.get("answer", "")).strip()
        if question and answer:
            items.append({"question": question, "answer": answer})
    return items


def run_faq_extract(job_id: str, api_url: Optional[str] = None) -> None:
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
        console.print(f"[red]Failed to load job: {job_resp.status_code}[/red]")
        raise typer.Exit(1)

    job = job_resp.json()
    kb_id = job["knowledge_base_id"]
    document_ids = job.get("document_ids") or []
    completed = int(job.get("completed_count") or 0)
    failed = int(job.get("failed_count") or 0)
    failure_notes: list[str] = []

    if not document_ids:
        _patch_job(base, job_id, auth_headers, basic, {"status": "completed"})
        return

    try:
        kb_config = _load_kb_config(base, kb_id, auth_headers, basic)
        faq_settings = kb_config.get("faq_settings") or {}
        metadata_keys = kb_config.get("metadata_keys") or []
        extraction_model_id = faq_settings.get("extraction_model_config_id")
        extraction_prompt = faq_settings.get("extraction_prompt") or ""
        if not extraction_model_id:
            raise RuntimeError("FAQ extraction model is not configured")

        s3_client = get_s3_client(
            cfg.aws_endpoint_url or None,
            cfg.aws_access_key_id,
            cfg.aws_secret_access_key,
            cfg.aws_region,
        )
        bucket = cfg.aws_bucket_name

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Extracting FAQs...", total=len(document_ids))

            for document_id in document_ids:
                progress.update(task, description=f"Extracting from {document_id}...")
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
                    prompt = _apply_template(extraction_prompt, {
                        "document_name": ctx.get("name") or document_id,
                        "markdown": markdown[:120000],
                    })
                    pairs = _chat_extract(base, extraction_model_id, prompt, auth_headers, basic)
                    if not pairs:
                        raise RuntimeError("No FAQ pairs extracted")

                    batch_items = [
                        {
                            "question": p["question"],
                            "answer": p["answer"],
                            "source_document_id": document_id,
                            "source_document_name": ctx.get("name"),
                            "doc_metadata": doc_meta,
                        }
                        for p in pairs
                    ]
                    batch_resp = requests.post(
                        f"{base}/internal-api/knowledge-bases/{kb_id}/faqs/batch",
                        headers={**auth_headers, "Content-Type": "application/json"},
                        auth=basic,
                        json={"items": batch_items},
                        timeout=120,
                    )
                    if not batch_resp.ok:
                        raise RuntimeError(f"batch create {batch_resp.status_code}")

                    completed += 1
                except Exception as exc:
                    failed += 1
                    failure_notes.append(f"{document_id}: {exc}")
                    console.print(f"[yellow]Document {document_id} failed: {exc}[/yellow]")

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
            raise typer.Exit(1)
        console.print(f"[green]FAQ extract done: {completed} docs, {failed} failed[/green]")
    except typer.Exit:
        raise
    except Exception as exc:
        _patch_job(
            base,
            job_id,
            auth_headers,
            basic,
            {
                "status": "failed",
                "error_message": str(exc)[:2000],
                "failed_count": max(failed, len(document_ids)),
            },
        )
        console.print(f"[red]FAQ extract failed: {exc}[/red]")
        raise typer.Exit(1) from exc
