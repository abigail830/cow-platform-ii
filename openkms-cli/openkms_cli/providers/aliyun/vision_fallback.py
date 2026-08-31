"""DocMind image quality gate + chat-completions vision fallback (Nova-style)."""

from __future__ import annotations

import base64
import json
import mimetypes
import re
from pathlib import Path
from typing import Any

import requests

from openkms_cli.core.model_resolve import ModelResolveError, resolve_models_for_job
from openkms_cli.core.settings import CliSettings, get_cli_settings
from openkms_cli.core.workflow_config import resolve_vision_fallback_options, vision_fallback_enabled
from openkms_cli.page_index.strategy import MARKDOWN_STRATEGY

_IMAGE_FILE_TYPES = frozenset({"JPG", "JPEG", "PNG", "WEBP", "GIF"})

_DEFAULT_SYSTEM_PROMPT = (
    "Transcribe all text in the image verbatim. "
    "Mark illegible characters as [unclear]. Do not guess or invent content."
)


def is_image_file_type(file_type: str | None) -> bool:
    return (file_type or "").strip().upper() in _IMAGE_FILE_TYPES


def _compact_text(text: str) -> str:
    return re.sub(r"\s+", "", text)


def _vision_quality_gate_reasons(text: str, *, options: dict[str, Any] | None = None) -> list[str]:
    """Return human-readable reasons the DocMind markdown failed the image quality gate."""
    opts = options or {}
    min_len = int(opts.get("min_text_length") or 40)
    max_ratio = float(opts.get("suspicious_ratio") or 0.08)
    min_gibberish_latin_ratio = float(opts.get("min_gibberish_latin_ratio") or 0.45)

    stripped = (text or "").strip()
    if not stripped:
        return ["empty_text"]
    if len(stripped) < min_len:
        return ["text_too_short"]
    if "�" in text:
        return ["replacement_char"]

    compact = _compact_text(text)
    # Allow ASCII word chars, CJK, common CN/JP punctuation (，。等), and western punctuation.
    allowed = r"\w\u4e00-\u9fff\u3000-\u303f\uff00-\uffef.,;:!?()/'%+\-"
    suspicious = len(re.findall(rf"[^{allowed}]", compact))
    if suspicious / max(len(compact), 1) > max_ratio:
        return ["high_suspicious_char_ratio"]

    if re.search(r"0{20,}|1{20,}", compact):
        return ["long_repeated_digit_run"]
    comma_one_runs = re.findall(r"(?:1,){8,}", text)
    if comma_one_runs:
        return ["repeated_comma_one_pattern"]

    latex_markers = len(re.findall(r"\\[\(\[]|\\[\)\]]|[\{\}]|\$", text))
    if latex_markers >= 6 and latex_markers / max(len(compact), 1) > 0.015:
        return ["latex_or_math_spam"]

    latin_words = re.findall(r"[A-Za-z]{5,}", text)
    if len(latin_words) >= 5:
        gibberish = 0
        for word in latin_words:
            vowels = len(re.findall(r"[aeiouAEIOU]", word))
            if vowels / len(word) < 0.2:
                gibberish += 1
        if gibberish / len(latin_words) >= min_gibberish_latin_ratio:
            return ["gibberish_latin_tokens"]

    return []


def needs_vision_fallback(text: str, *, options: dict[str, Any] | None = None) -> bool:
    """Heuristic quality gate for DocMind image markdown (Nova rules + OCR noise patterns)."""
    return len(_vision_quality_gate_reasons(text, options=options)) > 0


def _chat_completions_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    if re.search(r"/v\d+$", base, re.I):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _guess_image_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if mime and mime.startswith("image/"):
        return mime
    ext = path.suffix.lower()
    mapping = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    return mapping.get(ext, "image/jpeg")


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
        return "".join(parts).strip()
    return ""


def transcribe_image_sync(
    image_path: Path,
    params: dict[str, Any],
    *,
    system_prompt: str | None = None,
    timeout_seconds: int = 300,
) -> str:
    """OpenAI-compatible multimodal chat — transcribe image to plain text."""
    raw = image_path.read_bytes()
    if not raw:
        raise RuntimeError(f"Image file is empty: {image_path}")

    mime = _guess_image_mime(image_path)
    b64 = base64.standard_b64encode(raw).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    url = _chat_completions_url(str(params.get("base_url") or ""))
    api_key = str(params.get("api_key") or "").strip()
    if not api_key:
        raise RuntimeError("Vision fallback model has no api_key in platform config")

    model = str(params.get("model_name") or "").strip()
    if not model:
        raise RuntimeError("Vision fallback model has no provider model id")

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": (system_prompt or _DEFAULT_SYSTEM_PROMPT).strip()},
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": "Transcribe all text in this image."},
            ],
        },
    ]

    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
    }

    resp = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json=body,
        timeout=timeout_seconds,
    )
    if not resp.ok:
        raise RuntimeError(f"Vision fallback chat {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    message = (data.get("choices") or [{}])[0].get("message") or {}
    text = _message_text(message)
    return text.strip()


def _resolve_vision_model_params(
    workflow_config: dict[str, Any],
    *,
    cfg: CliSettings | None = None,
) -> dict[str, Any]:
    settings = cfg or get_cli_settings()
    opts = resolve_vision_fallback_options(workflow_config)
    model_name = str(opts.get("model_name") or "").strip()
    if not model_name:
        raise ModelResolveError("vision_fallback.model_name is required when vision fallback is enabled")

    resolved = resolve_models_for_job(
        {"vision_fallback": {"model_name": model_name}},
        cfg=settings,
        api_type="chat-completions",
    )
    params = resolved.get(model_name)
    if not params:
        raise ModelResolveError(f"No resolved credentials for vision_fallback.model_name={model_name!r}")
    return params


def apply_vision_fallback_if_needed(
    result: dict[str, Any],
    ctx: dict[str, Any],
    image_path: Path,
    workflow_config: dict[str, Any],
    page_index_strategy: str,
    *,
    hash_dir: Path | None = None,
    cfg: CliSettings | None = None,
) -> tuple[dict[str, Any], str]:
    """
    When enabled for image jobs and DocMind markdown fails quality gate,
    replace markdown with vision model transcription and use markdown-headings.
    """
    if not vision_fallback_enabled(workflow_config):
        return result, page_index_strategy

    doc = ctx.get("document") or {}
    if not is_image_file_type(str(doc.get("file_type") or "")):
        return result, page_index_strategy

    opts = resolve_vision_fallback_options(workflow_config)
    markdown = str(result.get("markdown") or "")
    gate_reasons = _vision_quality_gate_reasons(markdown, options=opts)
    if not gate_reasons:
        return result, page_index_strategy

    from rich.console import Console

    console = Console(stderr=True)
    console.print(
        "[yellow]DocMind image quality gate failed "
        f"({', '.join(gate_reasons)}); running vision fallback "
        f"({opts.get('model_name')})[/yellow]"
    )

    try:
        params = _resolve_vision_model_params(workflow_config, cfg=cfg)
        vision_text = transcribe_image_sync(
            image_path,
            params,
            system_prompt=str(opts.get("system_prompt") or "") or None,
            timeout_seconds=int(opts.get("timeout_seconds") or 300),
        )
    except Exception as exc:
        console.print(f"[yellow]Vision fallback failed ({exc}); keeping DocMind markdown[/yellow]")
        return result, page_index_strategy

    if not vision_text:
        console.print("[yellow]Vision fallback returned empty text; keeping DocMind markdown[/yellow]")
        return result, page_index_strategy

    updated = dict(result)
    updated["markdown"] = vision_text
    updated["page_count"] = max(int(updated.get("page_count") or 0), 1)
    updated["parse_route"] = "vision_fallback"
    updated["vision_fallback"] = {
        "reason": "document_mind_quality_gate",
        "gate_reasons": gate_reasons,
        "model": str(opts.get("model_name") or ""),
        "docmind_markdown_length": len(markdown.strip()),
    }
    updated["parser"] = str(opts.get("model_name") or "vision_fallback")

    if hash_dir is not None and hash_dir.is_dir():
        (hash_dir / "markdown.md").write_text(vision_text, encoding="utf-8")
        (hash_dir / "result.json").write_text(
            json.dumps(updated, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    return updated, MARKDOWN_STRATEGY
