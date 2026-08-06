"""Tests for page-index strategy selection (CLI param, no env)."""

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.page_index.strategy import (
    default_page_index_strategy,
    effective_page_index_strategy,
    page_index_strategy_for_native_ingest,
    strategy_for_markdown_ingest,
)


def test_default_by_provider():
    assert default_page_index_strategy(provider="aliyun") == "aliyun-layouts"
    assert default_page_index_strategy(provider="baidu") == "baidu-layouts"
    assert default_page_index_strategy(provider="paddle") == "markdown-headings"
    assert default_page_index_strategy(provider=None) == "markdown-headings"


def test_cli_override_wins():
    assert (
        effective_page_index_strategy(provider="aliyun", override="markdown-headings")
        == "markdown-headings"
    )
    assert (
        effective_page_index_strategy(provider="baidu", override="aliyun-layouts")
        == "aliyun-layouts"
    )
    assert (
        effective_page_index_strategy(provider="baidu", override="baidu-layouts")
        == "baidu-layouts"
    )


def test_page_index_strategy_for_native_ingest_falls_back_from_layout_strategies() -> None:
    assert page_index_strategy_for_native_ingest(None) == "markdown-headings"
    assert page_index_strategy_for_native_ingest("aliyun-layouts") == "markdown-headings"
    assert page_index_strategy_for_native_ingest("baidu-layouts") == "markdown-headings"
    assert page_index_strategy_for_native_ingest("markdown-headings") == "markdown-headings"
    assert (
        page_index_strategy_for_native_ingest("aliyun-layouts", ingest_kind=IngestKind.XMIND)
        == "xmind-outline"
    )
    assert strategy_for_markdown_ingest is page_index_strategy_for_native_ingest
