"""Load pipeline worker config YAML: job snapshot overrides packaged defaults.

YAML ``model_name`` is the Models list bold name (``app_model_configs.name``),
resolved via ``GET /internal-api/models/cli-params?model_name=…`` once per job.
Do not put api_key / base_url / UUID model ids in YAML.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

# openkms_cli/core/workflow_config.py → openkms-cli/workflows/
_WORKFLOWS_DIR = Path(__file__).resolve().parents[2] / "workflows"


class WorkflowConfigError(ValueError):
    """Invalid or missing workflow YAML."""


def workflows_dir() -> Path:
    return _WORKFLOWS_DIR


def default_workflow_path(pipeline_name: str) -> Path:
    name = (pipeline_name or "").strip()
    if not name:
        raise WorkflowConfigError("pipeline_name is required to load default workflow config")
    return _WORKFLOWS_DIR / f"{name}.yml"


def parse_workflow_yaml(raw: str, *, source: str = "config") -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise WorkflowConfigError(f"Empty workflow config ({source})")
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise WorkflowConfigError(f"Invalid YAML ({source}): {e}") from e
    if not isinstance(data, dict):
        raise WorkflowConfigError(f"Workflow config must be a YAML mapping ({source})")
    _reject_forbidden_keys(data, path="")
    return data


def _reject_forbidden_keys(node: Any, *, path: str) -> None:
    """Reject secrets / UUID model ids if someone puts them in YAML."""
    if isinstance(node, dict):
        for key, value in node.items():
            key_s = str(key)
            loc = f"{path}.{key_s}" if path else key_s
            lower = key_s.lower()
            if lower in {"api_key", "apikey", "base_url", "baseurl", "model_id", "model_config_id"}:
                raise WorkflowConfigError(
                    f"Forbidden key '{key_s}' in workflow config at {loc or '(root)'}. "
                    "Use model_name (Models list bold name); credentials come from the platform."
                )
            _reject_forbidden_keys(value, path=loc)
    elif isinstance(node, list):
        for i, item in enumerate(node):
            _reject_forbidden_keys(item, path=f"{path}[{i}]")


def load_packaged_default(pipeline_name: str) -> dict[str, Any]:
    path = default_workflow_path(pipeline_name)
    if not path.is_file():
        raise WorkflowConfigError(
            f"No packaged default workflow config for pipeline '{pipeline_name}' "
            f"(expected {path})"
        )
    return parse_workflow_yaml(path.read_text(encoding="utf-8"), source=str(path))


def resolve_job_workflow_config(
    *,
    pipeline_name: str,
    job_config_yaml: str | None,
) -> dict[str, Any]:
    """Prefer job snapshot YAML; otherwise load CLI packaged default for pipeline_name."""
    raw = (job_config_yaml or "").strip()
    if raw:
        return parse_workflow_yaml(raw, source="job.config_yaml")
    return load_packaged_default(pipeline_name)


def collect_model_names(config: dict[str, Any]) -> list[str]:
    """Collect unique model_name values used by this workflow config (job-level resolve)."""
    names: list[str] = []
    seen: set[str] = set()

    def add(name: Any) -> None:
        if not isinstance(name, str):
            return
        n = name.strip()
        if not n or n in seen:
            return
        seen.add(n)
        names.append(n)

    add(config.get("model_name"))
    meta = config.get("metadata_extract")
    if isinstance(meta, dict):
        add(meta.get("model_name"))
    asr = config.get("asr")
    if isinstance(asr, dict):
        add(asr.get("model_name"))
    post = config.get("post_process")
    if isinstance(post, dict):
        add(post.get("model_name"))
    return names


def metadata_extract_section(config: dict[str, Any]) -> dict[str, Any] | None:
    meta = config.get("metadata_extract")
    if not isinstance(meta, dict):
        return None
    return meta


def metadata_extract_enabled(config: dict[str, Any]) -> bool:
    meta = metadata_extract_section(config)
    if not meta:
        return False
    enabled = meta.get("enabled")
    if enabled is False:
        return False
    # enabled true or omitted → on when section present with model_name
    return bool(str(meta.get("model_name") or "").strip())


def page_index_section(config: dict[str, Any]) -> dict[str, Any] | None:
    section = config.get("page_index")
    if not isinstance(section, dict):
        return None
    return section


def async_section(config: dict[str, Any]) -> dict[str, Any] | None:
    section = config.get("async")
    if not isinstance(section, dict):
        return None
    return section


def docmind_section(config: dict[str, Any]) -> dict[str, Any] | None:
    section = config.get("docmind")
    if not isinstance(section, dict):
        return None
    return section


def resolve_docmind_submit_options(config: dict[str, Any]) -> dict[str, Any]:
    """Aliyun SubmitDocParserJob options from workflow YAML ``docmind`` section.

    Defaults follow Aliyun 大模型版 best practice for image/OCR quality:
    ``llm_enhancement=true`` and ``enhancement_mode=VLM`` (multimodal layout + OCR).
    Disable VLM only via ``enhancement_mode: null`` or ``""``; disable all via
    ``llm_enhancement: false``.
    """
    section = docmind_section(config) or {}
    llm_raw = section.get("llm_enhancement")
    llm_enhancement = True if llm_raw is None else bool(llm_raw)

    if not llm_enhancement:
        enhancement_mode: str | None = None
    elif "enhancement_mode" not in section:
        enhancement_mode = "VLM"
    else:
        mode_raw = section.get("enhancement_mode")
        if mode_raw is None or (isinstance(mode_raw, str) and not mode_raw.strip()):
            enhancement_mode = None
        else:
            enhancement_mode = str(mode_raw).strip().upper()

    return {
        "llm_enhancement": llm_enhancement,
        "enhancement_mode": enhancement_mode,
    }


def resolve_page_index_strategy(
    config: dict[str, Any],
    *,
    provider: str | None = None,
    ingest_kind: Any | None = None,
    cli_override: str | None = None,
) -> str | None:
    """CLI override wins; else YAML ``page_index.strategy``; else provider heuristic."""
    from openkms_cli.ingest.registry import is_native_ingest
    from openkms_cli.page_index.strategy import (
        effective_page_index_strategy,
        page_index_strategy_for_native_ingest,
    )

    override: str | None = None
    if cli_override and str(cli_override).strip():
        override = str(cli_override).strip()
    else:
        section = page_index_section(config)
        raw = section.get("strategy") if section else None
        if raw is not None and str(raw).strip():
            override = str(raw).strip()

    if ingest_kind is not None and is_native_ingest(ingest_kind):
        return page_index_strategy_for_native_ingest(override, ingest_kind=ingest_kind)
    return effective_page_index_strategy(provider=provider, override=override)


def resolve_async_poll_settings(
    config: dict[str, Any],
    *,
    cli_poll_interval: int | None,
    cli_max_wait: int | None,
    settings_poll_default: int,
    settings_max_wait_default: int,
) -> tuple[int, int]:
    """CLI flags override YAML ``async``; settings env is the last fallback."""
    section = async_section(config)
    interval = cli_poll_interval
    wait_cap = cli_max_wait
    if isinstance(section, dict):
        if interval is None and section.get("poll_interval_seconds") is not None:
            interval = int(section["poll_interval_seconds"])
        if wait_cap is None and section.get("max_wait_seconds") is not None:
            wait_cap = int(section["max_wait_seconds"])
    if interval is None:
        interval = settings_poll_default
    if wait_cap is None:
        wait_cap = settings_max_wait_default
    return interval, wait_cap
