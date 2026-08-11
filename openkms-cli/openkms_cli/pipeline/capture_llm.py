"""Resolve LLM credentials for capture post-process from workflow model_name."""

from __future__ import annotations

from typing import Any

from openkms_cli.core.model_resolve import ModelResolveError, resolve_models_for_job
from openkms_cli.core.settings import CliSettings


def workflow_llm_model_name(config: dict[str, Any]) -> str:
    top = str(config.get("model_name") or "").strip()
    if top:
        return top
    post = config.get("post_process")
    if isinstance(post, dict):
        nested = str(post.get("model_name") or "").strip()
        if nested:
            return nested
    return ""


def resolve_capture_llm_model(
    workflow: dict[str, Any],
    *,
    cfg: CliSettings,
) -> dict[str, Any] | None:
    """Resolve chat-completions model via cli-params; returns None when model_name unset."""
    display_name = workflow_llm_model_name(workflow)
    if not display_name:
        return None
    try:
        resolved = resolve_models_for_job(workflow, cfg=cfg, api_type="chat-completions")
    except ModelResolveError as e:
        raise RuntimeError(str(e)) from e
    params = resolved.get(display_name)
    if not params:
        raise RuntimeError(f"No resolved credentials for model_name={display_name!r}")
    return params
