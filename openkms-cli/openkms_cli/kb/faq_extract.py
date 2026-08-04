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
from openkms_cli.kb.rag_index import _load_kb_config, _patch_job
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


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text", "")))
        return "".join(parts).strip()
    return ""


def _parse_faq_pairs_payload(parsed: Any) -> list[dict[str, Any]]:
    if isinstance(parsed, dict):
        for key in ("faqs", "items", "questions", "data", "pairs"):
            nested = parsed.get(key)
            if isinstance(nested, list):
                parsed = nested
                break
    if not isinstance(parsed, list):
        raise RuntimeError("Extraction response must be a JSON array")

    items: list[dict[str, str]] = []
    for row in parsed:
        if not isinstance(row, dict):
            continue
        question = str(row.get("question", row.get("q", ""))).strip()
        answer = str(row.get("answer", row.get("a", ""))).strip()
        if question and answer:
            items.append({"question": question, "answer": answer})
    return items


def _parse_faq_pairs_from_text(raw: str) -> list[dict[str, str]]:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return _parse_faq_pairs_payload(json.loads(cleaned))
    except json.JSONDecodeError:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start >= 0 and end > start:
            return _parse_faq_pairs_payload(json.loads(cleaned[start : end + 1]))
        raise


def _build_extract_job_error_message(
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
        return f"{failed} of {failed + completed} document(s) failed to extract: {summary}"
    if failed:
        return f"All documents failed to extract: {summary}"
    return summary


def _chat_completions_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    if re.search(r"/v\d+$", base, re.I):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _chat_extract(
    base: str,
    model_id: str,
    prompt: str,
    headers: dict,
    basic,
    *,
    system_prompt: str = "",
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
    url = _chat_completions_url(params["base_url"])
    default_system = (
        "Extract FAQ pairs from the document. "
        "Respond with a JSON array of objects using keys question and answer. "
        "If the document is not already FAQ-formatted, infer useful Q&A from its content."
    )
    messages: list[dict[str, str]] = []
    resolved_system = (system_prompt or "").strip() or default_system
    if resolved_system:
        messages.append({"role": "system", "content": resolved_system})
    messages.append({"role": "user", "content": prompt})

    last_raw = ""
    for attempt in range(2):
        body: dict[str, Any] = {
            "model": params["model_name"],
            "messages": messages,
            "temperature": 0.35 if attempt else 0.2,
        }
        if params.get("max_completion_tokens"):
            body["max_completion_tokens"] = int(params["max_completion_tokens"])
        elif params.get("max_tokens"):
            body["max_tokens"] = int(params["max_tokens"])

        resp = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {params['api_key']}",
            },
            json=body,
            timeout=180,
        )
        if not resp.ok:
            raise RuntimeError(f"chat {resp.status_code} {resp.text[:300]}")

        data = resp.json()
        message = (data.get("choices") or [{}])[0].get("message") or {}
        last_raw = _message_text(message)
        if not last_raw:
            raise RuntimeError("Extraction model returned empty content")

        try:
            items = _parse_faq_pairs_from_text(last_raw)
        except (json.JSONDecodeError, RuntimeError) as exc:
            raise RuntimeError(f"Failed to parse extraction JSON: {exc}; raw={last_raw[:400]}") from exc

        if items:
            return items

        if attempt == 0:
            console.print("[yellow]Empty FAQ extraction response; retrying with stronger prompt[/yellow]")
            messages = [
                *messages,
                {"role": "assistant", "content": last_raw},
                {
                    "role": "user",
                    "content": (
                        "Your previous response had no valid FAQ pairs. "
                        "From the same document, extract at least 3 substantive question-and-answer "
                        "pairs a reader might ask (scope, pricing, timeline, deliverables, requirements). "
                        "Return a non-empty JSON array with question and answer keys only."
                    ),
                },
            ]

    raise RuntimeError(f"No FAQ pairs extracted after retry; raw={last_raw[:400]}")


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
    worker_llm_config = job.get("worker_llm_config")

    if not document_ids:
        _patch_job(base, job_id, auth_headers, basic, {"status": "completed"})
        return

    if not worker_llm_config or not (worker_llm_config.get("model_config_id") or "").strip():
        raise RuntimeError(
            "This job has no extraction config snapshot. "
            "Create a new extract job after configuring an FAQ extraction agent in KB Settings → AI tab."
        )

    try:
        kb_config = _load_kb_config(base, kb_id, auth_headers, basic)
        metadata_keys = kb_config.get("metadata_keys") or []
        extraction_model_id = worker_llm_config["model_config_id"]
        extraction_prompt = worker_llm_config.get("user_prompt_template") or ""
        extraction_system_prompt = worker_llm_config.get("system_prompt") or ""

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
                    pairs = _chat_extract(
                        base,
                        extraction_model_id,
                        prompt,
                        auth_headers,
                        basic,
                        system_prompt=extraction_system_prompt,
                    )
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
        error_message = _build_extract_job_error_message(
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
