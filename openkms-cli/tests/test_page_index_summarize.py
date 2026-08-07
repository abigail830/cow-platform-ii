"""Tests for extractive PageIndex node summaries."""

from openkms_cli.page_index.summarize import enrich_page_index_summaries


def test_enrich_summaries_from_line_bounds():
    markdown = "\n".join(
        [
            "# Intro",
            "This is the introduction about widgets.",
            "",
            "# Methods",
            "We use a robust evaluation protocol for widgets.",
            "More detail here.",
            "",
            "# Conclusion",
            "Widgets work well.",
        ]
    )
    tree = {
        "strategy": "markdown-headings",
        "structure": [
            {"title": "Intro", "node_id": "0001", "line_num": 1, "nodes": []},
            {"title": "Methods", "node_id": "0002", "line_num": 4, "nodes": []},
            {"title": "Conclusion", "node_id": "0003", "line_num": 8, "nodes": []},
        ],
    }
    enriched = enrich_page_index_summaries(tree, markdown)
    methods = enriched["structure"][1]
    assert "evaluation protocol" in methods["summary"]
    assert methods["prefix_summary"]


def test_enrich_skips_without_line_num():
    tree = {
        "structure": [{"title": "Only page", "node_id": "n1", "page_num": 1, "nodes": []}],
    }
    out = enrich_page_index_summaries(tree, "# Only page\nbody")
    assert "summary" not in out["structure"][0]
