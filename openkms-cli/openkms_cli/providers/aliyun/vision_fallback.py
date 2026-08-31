"""DocMind image quality gate + chat-completions vision fallback (Nova-style)."""

from __future__ import annotations

import base64
import json
import mimetypes
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openkms_cli.core.chat_completions import post_chat_completions
from openkms_cli.core.model_resolve import ModelResolveError, resolve_model_params_by_name
from openkms_cli.core.settings import CliSettings, get_cli_settings
from openkms_cli.core.workflow_config import resolve_vision_fallback_options, vision_fallback_enabled
from openkms_cli.page_index.strategy import MARKDOWN_STRATEGY

_IMAGE_FILE_TYPES = frozenset({"JPG", "JPEG", "PNG", "WEBP", "GIF"})

# Characters treated as normal in compact markdown (CJK + common punctuation).
_ALLOWED_COMPACT_CHARS = r"\w\u4e00-\u9fff\u3000-\u303f\uff00-\uffef.,;:!?()/'%+\-"

_DEFAULT_SYSTEM_PROMPT = (
    "Transcribe all text in the image verbatim. "
    "Mark illegible characters as [unclear]. Do not guess or invent content."
)


def is_image_file_type(file_type: str | None) -> bool:
    return (file_type or "").strip().upper() in _IMAGE_FILE_TYPES


def _compact_text(text: str) -> str:
    return re.sub(r"\s+", "", text)


@dataclass(frozen=True)
class _QualityGateOptions:
    min_text_length: int = 40
    suspicious_ratio: float = 0.08
    min_gibberish_latin_ratio: float = 0.45

    @classmethod
    def from_dict(cls, options: dict[str, Any] | None) -> _QualityGateOptions:
        opts = options or {}
        return cls(
            min_text_length=int(opts.get("min_text_length") or 40),
            suspicious_ratio=float(opts.get("suspicious_ratio") or 0.08),
            min_gibberish_latin_ratio=float(opts.get("min_gibberish_latin_ratio") or 0.45),
        )


def _check_empty_text(stripped: str) -> str | None:
    if not stripped:
        return "empty_text"
    return None


def _check_text_too_short(stripped: str, *, min_len: int) -> str | None:
    if len(stripped) < min_len:
        return "text_too_short"
    return None


def _check_replacement_char(text: str) -> str | None:
    if "�" in text:
        return "replacement_char"
    return None


def _check_high_suspicious_char_ratio(compact: str, *, max_ratio: float) -> str | None:
    suspicious = len(re.findall(rf"[^{_ALLOWED_COMPACT_CHARS}]", compact))
    if suspicious / max(len(compact), 1) > max_ratio:
        return "high_suspicious_char_ratio"
    return None


def _check_long_repeated_digit_run(compact: str) -> str | None:
    if re.search(r"0{20,}|1{20,}", compact):
        return "long_repeated_digit_run"
    return None


def _check_repeated_comma_one_pattern(text: str) -> str | None:
    if re.findall(r"(?:1,){8,}", text):
        return "repeated_comma_one_pattern"
    return None


def _check_latex_or_math_spam(text: str, compact: str) -> str | None:
    latex_markers = len(re.findall(r"\\[\(\[]|\\[\)\]]|[\{\}]|\$", text))
    if latex_markers >= 6 and latex_markers / max(len(compact), 1) > 0.015:
        return "latex_or_math_spam"
    return None


def _check_latex_angle_spam(text: str) -> str | None:
    if len(re.findall(r"\\angle\s*[A-Za-z]", text)) >= 10:
        return "latex_angle_spam"
    return None


def _check_latex_cdot_spam(text: str) -> str | None:
    if text.count("\\cdot") >= 20:
        return "latex_cdot_spam"
    return None


def _check_high_backslash_density(compact: str) -> str | None:
    if compact.count("\\") / max(len(compact), 1) > 0.06:
        return "high_backslash_density"
    return None


def _has_heavy_text_repetition(text: str, *, window: int = 48, min_repeats: int = 3) -> bool:
    """Detect OCR hallucination loops (e.g. same \\angle A \\cdot ... block repeated)."""
    normalized = re.sub(r"\s+", " ", (text or "").strip())
    if len(normalized) < window * min_repeats:
        return False
    step = max(8, window // 4)
    counts: dict[str, int] = {}
    for start in range(0, len(normalized) - window + 1, step):
        chunk = normalized[start : start + window]
        counts[chunk] = counts.get(chunk, 0) + 1
        if counts[chunk] >= min_repeats:
            return True
    return False


def _check_repeated_text_blocks(text: str) -> str | None:
    if _has_heavy_text_repetition(text):
        return "repeated_text_blocks"
    return None


def _check_gibberish_latin_tokens(text: str, *, min_ratio: float) -> str | None:
    latin_words = re.findall(r"[A-Za-z]{5,}", text)
    if len(latin_words) < 5:
        return None
    gibberish = sum(
        1
        for word in latin_words
        if len(re.findall(r"[aeiouAEIOU]", word)) / len(word) < 0.2
    )
    if gibberish / len(latin_words) >= min_ratio:
        return "gibberish_latin_tokens"
    return None


def _vision_quality_gate_reasons(text: str, *, options: dict[str, Any] | None = None) -> list[str]:
    """Return human-readable reasons the DocMind markdown failed the image quality gate."""
    opts = _QualityGateOptions.from_dict(options)
    stripped = (text or "").strip()
    compact = _compact_text(text)

    checks: tuple[str | None, ...] = (
        _check_empty_text(stripped),
        _check_text_too_short(stripped, min_len=opts.min_text_length),
        _check_replacement_char(text),
        _check_high_suspicious_char_ratio(compact, max_ratio=opts.suspicious_ratio),
        _check_long_repeated_digit_run(compact),
        _check_repeated_comma_one_pattern(text),
        _check_latex_or_math_spam(text, compact),
        _check_latex_angle_spam(text),
        _check_latex_cdot_spam(text),
        _check_high_backslash_density(compact),
        _check_repeated_text_blocks(text),
        _check_gibberish_latin_tokens(text, min_ratio=opts.min_gibberish_latin_ratio),
    )
    for reason in checks:
        if reason:
            return [reason]
    return []


def needs_vision_fallback(text: str, *, options: dict[str, Any] | None = None) -> bool:
    """Heuristic quality gate for DocMind image markdown (Nova rules + OCR noise patterns)."""
    return len(_vision_quality_gate_reasons(text, options=options)) > 0


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

    model = str(params.get("model_name") or "").strip()
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

    data = post_chat_completions(
        params,
        {
            "model": model,
            "messages": messages,
            "temperature": 0.1,
        },
        timeout_seconds=timeout_seconds,
        error_prefix="Vision fallback chat",
    )
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
    return resolve_model_params_by_name(model_name, cfg=settings)


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
