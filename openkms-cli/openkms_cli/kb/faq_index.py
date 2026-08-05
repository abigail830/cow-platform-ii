"""FAQ knowledge base indexing: embed published FAQ questions."""

from typing import Any, Optional

import requests
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from openkms_cli.core.auth import try_api_request_auth
from openkms_cli.core.settings import get_cli_settings
from openkms_cli.kb.embedding_provider import embedding_supports_dimensions
from openkms_cli.kb.embeddings import generate_embeddings
from openkms_cli.kb.rag_index import _build_job_error_message, _patch_job

console = Console(stderr=True)
_JOB_API = "/internal-api/kb-import-jobs"


def _job_api(base: str) -> str:
    return f"{base}{_JOB_API}"


def _as_dimensions(value: Any, default: int = 1024) -> int:
    try:
        if value is None or value == "":
            return default
        dims = int(value)
    except (TypeError, ValueError):
        return default
    return max(1, min(dims, 65536))


def run_faq_index(job_id: str, api_url: Optional[str] = None) -> None:
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
    faq_ids = job.get("faq_ids") or []
    completed = int(job.get("completed_count") or 0)
    failed = int(job.get("failed_count") or 0)
    failure_notes: list[str] = []

    if not faq_ids:
        _patch_job(base, job_id, auth_headers, basic, {"status": "completed", "error_message": None})
        console.print("[green]No FAQs to index[/green]")
        return

    from openkms_cli.core.model_resolve import ModelResolveError, resolve_models_for_job
    from openkms_cli.core.workflow_config import resolve_job_workflow_config

    pipeline_name = (job.get("pipeline_name") or "kb-faq-index").strip() or "kb-faq-index"
    try:
        workflow_config = resolve_job_workflow_config(
            pipeline_name=pipeline_name,
            job_config_yaml=job.get("config_yaml"),
        )
        resolved_models = resolve_models_for_job(workflow_config, cfg=cfg, api_type="embeddings")
    except (ModelResolveError, ValueError) as e:
        raise RuntimeError(str(e)) from e

    model_name = str(workflow_config.get("model_name") or "").strip()
    if not model_name or model_name not in resolved_models:
        raise RuntimeError(
            f"FAQ index config missing model_name (Models list bold name). "
            f"Set it in Admin → Pipelines Config YAML or openkms-cli/workflows/{pipeline_name}.yml"
        )

    model_params = resolved_models[model_name]
    dimensions = _as_dimensions(workflow_config.get("dimensions"), 1024)
    embed_cfg: dict[str, Any] = {
        "base_url": model_params.get("base_url"),
        "api_key": model_params.get("api_key"),
        "model_name": model_params.get("model_name"),
        "extra_config": model_params.get("extra_config") or {},
        "supports_dimensions": embedding_supports_dimensions(
            {
                "base_url": model_params.get("base_url"),
                "model_name": model_params.get("model_name"),
                "extra_config": model_params.get("extra_config") or {},
            }
        ),
    }

    try:
        faqs_resp = requests.get(
            f"{base}/internal-api/knowledge-bases/{kb_id}/faqs",
            params={"faq_ids": ",".join(faq_ids)},
            headers=auth_headers,
            auth=basic,
            timeout=60,
        )
        if not faqs_resp.ok:
            raise RuntimeError(f"Failed to load FAQs: {faqs_resp.status_code}")

        faqs = (faqs_resp.json().get("items") or [])
        faq_map = {f["id"]: f for f in faqs}

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Indexing FAQs...", total=len(faq_ids))

            for faq_id in faq_ids:
                progress.update(task, description=f"Indexing FAQ {faq_id}...")
                faq = faq_map.get(faq_id)
                if not faq:
                    failed += 1
                    failure_notes.append(f"{faq_id}: not found")
                    progress.advance(task)
                    continue

                try:
                    question = faq["question"]
                    embeddings = generate_embeddings([question], embed_cfg, dimensions=dimensions)
                    embedding = embeddings[0]

                    put_resp = requests.put(
                        f"{base}/internal-api/knowledge-bases/{kb_id}/faqs/{faq_id}",
                        headers={**auth_headers, "Content-Type": "application/json"},
                        auth=basic,
                        json={
                            "embedding": embedding,
                            "index_status": "indexed",
                            "index_error": None,
                        },
                        timeout=120,
                    )
                    if not put_resp.ok:
                        raise RuntimeError(f"PUT faq {put_resp.status_code} {put_resp.text[:200]}")
                    completed += 1
                except Exception as exc:
                    failed += 1
                    failure_notes.append(f"{faq_id}: {exc}")
                    requests.put(
                        f"{base}/internal-api/knowledge-bases/{kb_id}/faqs/{faq_id}",
                        headers={**auth_headers, "Content-Type": "application/json"},
                        auth=basic,
                        json={"index_status": "failed", "index_error": str(exc)[:500]},
                        timeout=60,
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
            console.print(f"[red]FAQ index failed: {error_message}[/red]")
            raise typer.Exit(1)
        console.print(f"[green]FAQ index done: {completed} completed, {failed} failed[/green]")
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
                "completed_count": completed,
                "failed_count": max(failed, len(faq_ids) - completed),
            },
        )
        console.print(f"[red]FAQ index failed: {exc}[/red]")
        raise typer.Exit(1) from exc
