"""Route image jobs: classify printed vs handwritten, optional direct VLM parse."""

import base64
import json
import re
import tempfile
from pathlib import Path
from typing import Any, Literal

from rich.console import Console

from openkms_cli.core.chat_completions import post_chat_completions
from openkms_cli.core.model_resolve import ModelResolveError, resolve_model_params_by_name
from openkms_cli.core.workflow_config import (
    image_routing_enabled,
    resolve_image_routing_options,
    resolve_vision_fallback_options,
)
from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.page_index.strategy import MARKDOWN_STRATEGY
from openkms_cli.parse.result import empty_parse_result, validate_parse_result
from openkms_cli.pipeline.post_ingest import (
    download_input_to_temp,
    fail_job,
    finalize_job_artifacts,
)
from openkms_cli.providers.aliyun.vision_fallback import (
    _guess_image_mime,
    _message_text,
    _resolve_vision_model_params,
    is_image_file_type,
    transcribe_image_sync,
)

ImageContentLabel = Literal["printed", "handwritten", "mixed", "uncertain"]

console = Console(stderr=True)

_CLASSIFY_SYSTEM_PROMPT = (
    "Classify the document image. Reply with JSON only, no markdown:\n"
    '{"label":"printed"|"handwritten"|"mixed"|"uncertain","confidence":0.0-1.0}\n'
    "printed = machine-printed/typeset text (forms, books, screenshots of text)\n"
    "handwritten = mostly handwritten ink or pen strokes\n"
    "mixed = substantial printed and handwritten content\n"
    "uncertain = blank, too blurry, or cannot tell"
)


def _parse_classification_payload(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty classification response")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise ValueError("classification response is not JSON") from None
        data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("classification response must be a JSON object")
    label = str(data.get("label") or "uncertain").strip().lower()
    if label not in {"printed", "handwritten", "mixed", "uncertain"}:
        label = "uncertain"
    try:
        confidence = float(data.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(confidence, 1.0))
    return {"label": label, "confidence": confidence}


def classify_image_sync(
    image_path: Path,
    params: dict[str, Any],
    *,
    timeout_seconds: int = 120,
) -> dict[str, Any]:
    """Lightweight vision call — printed vs handwritten routing."""
    raw = image_path.read_bytes()
    if not raw:
        raise RuntimeError(f"Image file is empty: {image_path}")

    mime = _guess_image_mime(image_path)
    b64 = base64.standard_b64encode(raw).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    data = post_chat_completions(
        params,
        {
            "model": str(params.get("model_name") or "").strip(),
            "messages": [
                {"role": "system", "content": _CLASSIFY_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": "Classify this image."},
                    ],
                },
            ],
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
        },
        timeout_seconds=timeout_seconds,
        error_prefix="Image classify chat",
    )
    message = (data.get("choices") or [{}])[0].get("message") or {}
    return _parse_classification_payload(_message_text(message))


def should_route_image_to_docmind(
    classification: dict[str, Any],
    *,
    options: dict[str, Any],
) -> bool:
    """Only clearly printed images use DocMind; handwritten/mixed/uncertain → VLM."""
    min_confidence = float(options.get("min_printed_confidence") or 0.65)
    label = str(classification.get("label") or "uncertain")
    confidence = float(classification.get("confidence") or 0)
    return label == "printed" and confidence >= min_confidence


def _resolve_classify_model_params(workflow_config: dict[str, Any], *, cfg: Any = None) -> dict[str, Any]:
    from openkms_cli.core.settings import get_cli_settings

    settings = cfg or get_cli_settings()
    opts = resolve_image_routing_options(workflow_config)
    model_name = str(opts.get("classify_model_name") or opts.get("model_name") or "").strip()
    if not model_name:
        raise ModelResolveError("image_routing requires classify_model_name or vision_fallback.model_name")
    return resolve_model_params_by_name(model_name, cfg=settings)


def _build_vlm_image_result(file_hash: str, markdown: str, *, route_meta: dict[str, Any]) -> dict[str, Any]:
    base = empty_parse_result(file_hash)
    base["markdown"] = markdown
    base["page_count"] = max(1, int(base.get("page_count") or 0))
    base["parse_route"] = route_meta.get("parse_route", "image_vlm_direct")
    base["parser"] = str(route_meta.get("model") or "qwen3.7-plus")
    base["image_routing"] = route_meta
    return validate_parse_result(base)


def run_image_vlm_direct_job(
    api: str,
    job_id: str,
    ctx: dict[str, Any],
    workflow_config: dict[str, Any],
    *,
    classification: dict[str, Any] | None = None,
    cfg: Any = None,
) -> None:
    """Skip DocMind — transcribe image with chat-completions vision, then finalize."""
    work = Path(tempfile.mkdtemp(prefix="openkms-image-vlm-"))
    out_base = work / "parsed"
    out_base.mkdir(parents=True, exist_ok=True)

    stored, original_content, _ext = download_input_to_temp(ctx, work)
    doc = ctx.get("document") or {}
    file_hash = str(doc.get("file_hash") or "")
    if not file_hash:
        fail_job(api, job_id, "Missing document file_hash for image VLM parse")
        raise SystemExit(1)

    vf_opts = resolve_vision_fallback_options(workflow_config)
    try:
        params = _resolve_vision_model_params(workflow_config, cfg=cfg)
        markdown = transcribe_image_sync(
            stored,
            params,
            system_prompt=str(vf_opts.get("system_prompt") or "") or None,
            timeout_seconds=int(vf_opts.get("timeout_seconds") or 300),
        )
    except Exception as exc:
        fail_job(api, job_id, f"Image VLM parse failed: {exc}")
        raise SystemExit(1) from exc

    if not markdown.strip():
        fail_job(api, job_id, "Image VLM parse returned empty text")
        raise SystemExit(1)

    hash_dir = out_base / file_hash
    hash_dir.mkdir(parents=True, exist_ok=True)

    route_meta: dict[str, Any] = {
        "parse_route": "image_vlm_direct",
        "model": str(vf_opts.get("model_name") or ""),
        "classification": classification,
    }
    result = _build_vlm_image_result(file_hash, markdown, route_meta=route_meta)
    (hash_dir / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    (hash_dir / "markdown.md").write_text(markdown, encoding="utf-8")

    console.print(
        "[green]Image routed to direct VLM parse "
        f"({vf_opts.get('model_name')}, classification={classification})[/green]"
    )

    finalize_job_artifacts(
        api=api,
        job_id=job_id,
        ctx=ctx,
        result=result,
        hash_dir=hash_dir,
        ingest_kind=IngestKind.CLOUD_OCR,
        page_index_strategy=MARKDOWN_STRATEGY,
        provider="aliyun",
        original_content=original_content,
    )


def maybe_skip_docmind_for_image(
    api: str,
    job_id: str,
    ctx: dict[str, Any],
    workflow_config: dict[str, Any],
) -> bool:
    """
    Classify image and run direct VLM when not clearly printed.
    Returns True when DocMind submit/poll should be skipped.
    """
    if not image_routing_enabled(workflow_config):
        return False

    doc = ctx.get("document") or {}
    if not is_image_file_type(str(doc.get("file_type") or "")):
        return False

    work = Path(tempfile.mkdtemp(prefix="openkms-image-route-"))
    stored, _content, _ext = download_input_to_temp(ctx, work)
    opts = resolve_image_routing_options(workflow_config)

    try:
        params = _resolve_classify_model_params(workflow_config)
        classification = classify_image_sync(
            stored,
            params,
            timeout_seconds=int(opts.get("classify_timeout_seconds") or 120),
        )
    except Exception as exc:
        console.print(
            f"[yellow]Image classification failed ({exc}); defaulting to direct VLM[/yellow]"
        )
        classification = {"label": "uncertain", "confidence": 0.0, "error": str(exc)}

    if should_route_image_to_docmind(classification, options=opts):
        console.print(
            "[dim]Image classified as printed "
            f"(confidence={classification.get('confidence')}); using DocMind[/dim]"
        )
        return False

    run_image_vlm_direct_job(
        api,
        job_id,
        ctx,
        workflow_config,
        classification=classification,
    )
    return True
