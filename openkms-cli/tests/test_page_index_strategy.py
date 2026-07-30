"""Tests for page-index strategy selection (CLI param, no env)."""

from openkms_cli.page_index.strategy import (
    default_page_index_strategy,
    effective_page_index_strategy,
    strategy_for_markdown_ingest,
)


def test_default_by_provider():
    assert default_page_index_strategy(provider="aliyun") == "aliyun-layouts"
    assert default_page_index_strategy(provider="baidu") == "baidu-layouts"
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


def test_strategy_for_markdown_ingest_falls_back_from_layout_strategies():
    assert strategy_for_markdown_ingest(None) == "markdown-headings"
    assert strategy_for_markdown_ingest("aliyun-layouts") == "markdown-headings"
    assert strategy_for_markdown_ingest("baidu-layouts") == "markdown-headings"
    assert strategy_for_markdown_ingest("markdown-headings") == "markdown-headings"
