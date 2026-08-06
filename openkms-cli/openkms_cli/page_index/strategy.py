"""Dispatch page-index builders by strategy name."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from openkms_cli.ingest.kinds import IngestKind

from .aliyun_layout import STRATEGY_NAME as ALIYUN_STRATEGY
from .aliyun_layout import write_page_index_from_aliyun_layouts
from .baidu_layout import STRATEGY_NAME as BAIDU_STRATEGY
from .baidu_layout import write_page_index_from_baidu_layouts
from .markdown import STRATEGY_NAME as MARKDOWN_STRATEGY
from .markdown import write_page_index_from_markdown
from .xmind_outline import STRATEGY_NAME as XMIND_OUTLINE_STRATEGY
from .xmind_outline import write_page_index_from_xmind_outline

SUPPORTED_STRATEGIES = (
    MARKDOWN_STRATEGY,
    XMIND_OUTLINE_STRATEGY,
    ALIYUN_STRATEGY,
    BAIDU_STRATEGY,
)


def normalize_strategy(name: str | None) -> str:
    value = (name or MARKDOWN_STRATEGY).strip().lower()
    if value not in SUPPORTED_STRATEGIES:
        raise ValueError(
            f"Unsupported page-index strategy '{name}'. "
            f"Choose one of: {', '.join(SUPPORTED_STRATEGIES)}"
        )
    return value


def default_page_index_strategy(*, provider: str | None = None) -> str:
    if provider == "aliyun":
        return ALIYUN_STRATEGY
    if provider == "baidu":
        return BAIDU_STRATEGY
    if provider == "paddle":
        return MARKDOWN_STRATEGY
    return MARKDOWN_STRATEGY


def effective_page_index_strategy(
    *,
    provider: str | None,
    override: str | None = None,
) -> str:
    if override and override.strip():
        return normalize_strategy(override)
    return default_page_index_strategy(provider=provider)


def page_index_strategy_for_native_ingest(
    override: str | None = None,
    *,
    ingest_kind: IngestKind | None = None,
) -> str:
    """
    Native ingest has no cloud layout JSON.

    Pipeline templates often pass aliyun-layouts / baidu-layouts; those require
    layouts from DocMind/Baidu parse and would fail for plain native files.
    """
    name = (override or "").strip().lower()
    if ingest_kind == IngestKind.XMIND:
        if name in (ALIYUN_STRATEGY, BAIDU_STRATEGY) or not name:
            return XMIND_OUTLINE_STRATEGY
        if name == MARKDOWN_STRATEGY:
            return MARKDOWN_STRATEGY
        return normalize_strategy(name)
    if name in (ALIYUN_STRATEGY, BAIDU_STRATEGY) or not name:
        return MARKDOWN_STRATEGY
    return normalize_strategy(name)


# Backward-compatible alias (prefer page_index_strategy_for_native_ingest).
strategy_for_markdown_ingest = page_index_strategy_for_native_ingest


def write_page_index(
    *,
    strategy: str,
    hash_dir: Path,
    layouts: list[dict[str, Any]] | None = None,
    doc_name: str | None = None,
) -> dict[str, Any] | None:
    """
    Write hash_dir/page_index.json using the selected strategy.
    For aliyun-layouts, rewrites markdown.md with layout anchors when layouts are provided.
    For baidu-layouts, uses Baidu parse_result pages[].layouts title types.
    """
    output_path = hash_dir / "page_index.json"
    md_path = hash_dir / "markdown.md"
    strategy = normalize_strategy(strategy)

    if strategy == MARKDOWN_STRATEGY:
        if not md_path.is_file():
            return None
        return write_page_index_from_markdown(md_path, output_path)

    if strategy == XMIND_OUTLINE_STRATEGY:
        result_path = hash_dir / "result.json"
        if not result_path.is_file():
            return None
        tree = write_page_index_from_xmind_outline(
            result_path,
            output_path,
            doc_name=doc_name or hash_dir.name,
        )
        if tree is not None:
            return tree
        if not md_path.is_file():
            return None
        return write_page_index_from_markdown(md_path, output_path)

    if strategy == ALIYUN_STRATEGY:
        if not layouts:
            raise ValueError("aliyun-layouts strategy requires layout list")
        return write_page_index_from_aliyun_layouts(
            layouts,
            doc_name=doc_name or hash_dir.name,
            output_path=output_path,
            markdown_path=md_path if md_path.parent.exists() else None,
        )

    if strategy == BAIDU_STRATEGY:
        if not layouts:
            raise ValueError("baidu-layouts strategy requires layout list")
        return write_page_index_from_baidu_layouts(
            layouts,
            doc_name=doc_name or hash_dir.name,
            output_path=output_path,
        )

    raise ValueError(f"Unhandled strategy: {strategy}")


def load_layouts_from_result_json(result_path: Path) -> list[dict[str, Any]]:
    data = json.loads(result_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return []
    for key in ("baidu_layouts", "aliyun_layouts"):
        raw = data.get(key)
        if isinstance(raw, list):
            return [item for item in raw if isinstance(item, dict)]
    layouts: list[dict[str, Any]] = []
    for block in data.get("parsing_res_list") or []:
        if isinstance(block, dict):
            layouts.append(block)
    return layouts
