"""Tests for shared post-ingest helpers."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.pipeline.post_ingest import (
    build_page_index,
    ensure_original_upload_artifact,
    finalize_job_artifacts,
    layouts_from_result,
    original_basename_from_ctx,
    write_hash_dir_artifacts,
)


def test_layouts_from_result_baidu() -> None:
    layouts = [{"type": "title", "text": "A"}]
    assert layouts_from_result({"baidu_layouts": layouts}) == layouts


def test_original_basename_from_ctx() -> None:
    ctx = {"input_uri": "s3://bucket/documents/abc/original.xlsx"}
    assert original_basename_from_ctx(ctx) == "original.xlsx"


def test_ensure_original_upload_artifact(tmp_path: Path) -> None:
    hash_dir = tmp_path / "h"
    hash_dir.mkdir()
    ensure_original_upload_artifact(hash_dir, basename="original.pdf", content=b"%PDF-1.4")
    assert (hash_dir / "original.pdf").read_bytes() == b"%PDF-1.4"


def test_write_hash_dir_artifacts(tmp_path: Path) -> None:
    hash_dir = tmp_path / "abc"
    hash_dir.mkdir()
    result = {"file_hash": "abc", "markdown": "# Hi"}
    write_hash_dir_artifacts(
        hash_dir=hash_dir,
        result=result,
        original_content=b"bytes",
        original_basename="original.markdown",
    )
    assert (hash_dir / "original.markdown").read_bytes() == b"bytes"
    assert json.loads((hash_dir / "result.json").read_text())["file_hash"] == "abc"
    assert (hash_dir / "markdown.md").read_text() == "# Hi"


def test_build_page_index_native_falls_back_layout_strategy(tmp_path: Path) -> None:
    hash_dir = tmp_path / "h"
    hash_dir.mkdir()
    (hash_dir / "markdown.md").write_text("# Title\n", encoding="utf-8")

    strategy = build_page_index(
        hash_dir,
        ingest_kind=IngestKind.MARKDOWN,
        page_index_strategy="aliyun-layouts",
        doc_name="doc",
    )
    assert strategy == "markdown-headings"
    assert (hash_dir / "page_index.json").is_file()


@patch("openkms_cli.pipeline.post_ingest.patch_job")
@patch("openkms_cli.pipeline.post_ingest.complete_job_after_parse")
@patch("openkms_cli.pipeline.post_ingest.sync_markdown_and_version", return_value=True)
@patch("openkms_cli.pipeline.post_ingest.upload_hash_dir", return_value=3)
@patch("openkms_cli.pipeline.post_ingest.build_page_index", return_value="markdown-headings")
def test_finalize_job_artifacts(
    mock_build: MagicMock,
    mock_upload: MagicMock,
    mock_sync: MagicMock,
    mock_complete: MagicMock,
    mock_patch: MagicMock,
    tmp_path: Path,
) -> None:
    hash_dir = tmp_path / "hash"
    hash_dir.mkdir()
    (hash_dir / "markdown.md").write_text("# Doc", encoding="utf-8")
    ctx = {
        "document": {"id": "doc-1", "name": "readme.md"},
        "input_uri": "s3://bucket/documents/abc/original.md",
        "s3_prefix": "documents/abc",
        "pipeline_name": "baidu-doc-parse",
        "config_yaml": "metadata_extract:\n  enabled: false\n",
    }
    result = {"markdown": "# Doc", "file_hash": "abc"}

    finalize_job_artifacts(
        api="http://api",
        job_id="job-1",
        ctx=ctx,
        result=result,
        hash_dir=hash_dir,
        ingest_kind=IngestKind.MARKDOWN,
        page_index_strategy="aliyun-layouts",
        original_content=b"# Doc bytes",
    )

    assert (hash_dir / "original.md").read_bytes() == b"# Doc bytes"

    mock_build.assert_called_once()
    mock_upload.assert_called_once()
    mock_sync.assert_called_once()
    mock_complete.assert_called_once()
    mock_patch.assert_called()
