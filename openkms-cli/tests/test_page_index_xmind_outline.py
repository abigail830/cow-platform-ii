"""Tests for xmind-outline page index."""

import json
from pathlib import Path

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.ingest.xmind.materialize import materialize_xmind_ingest
from openkms_cli.page_index.strategy import page_index_strategy_for_native_ingest, write_page_index
from openkms_cli.pipeline.post_ingest import build_page_index
from tests.test_ingest_xmind import _sample_json_content, _zip_bytes


def test_page_index_strategy_defaults_xmind_to_outline() -> None:
    assert (
        page_index_strategy_for_native_ingest(None, ingest_kind=IngestKind.XMIND)
        == "xmind-outline"
    )
    assert (
        page_index_strategy_for_native_ingest("aliyun-layouts", ingest_kind=IngestKind.XMIND)
        == "xmind-outline"
    )
    assert (
        page_index_strategy_for_native_ingest("markdown-headings", ingest_kind=IngestKind.XMIND)
        == "markdown-headings"
    )


def test_xmind_materialize_builds_outline_page_index(tmp_path: Path) -> None:
    content = _zip_bytes({"content.json": _sample_json_content()})
    src = tmp_path / "plan.xmind"
    src.write_bytes(content)

    _, hash_dir = materialize_xmind_ingest(
        stored_input=src,
        original_content=content,
        out_base=tmp_path / "parsed",
    )

    tree = write_page_index(
        strategy="xmind-outline",
        hash_dir=hash_dir,
        doc_name="plan",
    )
    assert tree is not None
    assert tree["strategy"] == "xmind-outline"
    structure = tree["structure"]
    assert len(structure) == 1
    sheet = structure[0]
    assert sheet["title"] == "Plan"
    assert sheet.get("topic_count") == 3
    assert sheet["nodes"][0]["title"] == "Root"
    assert sheet["nodes"][0]["nodes"][0]["title"] == "Child"

    stored = json.loads((hash_dir / "page_index.json").read_text(encoding="utf-8"))
    assert stored["strategy"] == "xmind-outline"


def test_build_page_index_xmind_native_uses_outline(tmp_path: Path) -> None:
    content = _zip_bytes({"content.json": _sample_json_content()})
    src = tmp_path / "plan.xmind"
    src.write_bytes(content)
    _, hash_dir = materialize_xmind_ingest(
        stored_input=src,
        original_content=content,
        out_base=tmp_path / "parsed",
    )

    strategy = build_page_index(
        hash_dir,
        ingest_kind=IngestKind.XMIND,
        page_index_strategy="baidu-layouts",
        doc_name="plan",
    )
    assert strategy == "xmind-outline"
    page_index = json.loads((hash_dir / "page_index.json").read_text(encoding="utf-8"))
    assert page_index["strategy"] == "xmind-outline"
