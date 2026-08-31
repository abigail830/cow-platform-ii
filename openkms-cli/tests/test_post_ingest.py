"""Tests for shared post-ingest helpers."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.pipeline.post_ingest import (
    build_page_index,
    ensure_original_upload_artifact,
    finalize_job_artifacts,
    is_eval_run_job,
    layouts_from_result,
    original_basename_from_ctx,
    sync_markdown_and_version,
    upload_hash_dir_to_document_bundle,
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
@patch("openkms_cli.pipeline.post_ingest.upload_hash_dir_to_document_bundle", return_value=3)
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
    ctx = {
        "document": {"id": "doc-1", "name": "readme.md"},
        "input_uri": "s3://bucket/documents/abc/original.md",
        "s3_prefix": "documents/abc",
        "pipeline_name": "baidu-doc-parse",
        "config_yaml": "metadata_extract:\n  enabled: false\n",
    }
    file_hash = "a" * 64
    result = {"markdown": "# Doc", "file_hash": file_hash, "parsing_res_list": [], "layout_det_res": [], "page_count": 1}

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
    assert json.loads((hash_dir / "result.json").read_text())["file_hash"] == file_hash
    assert (hash_dir / "markdown.md").read_text() == "# Doc"

    mock_build.assert_called_once()
    mock_upload.assert_called_once()
    mock_sync.assert_called_once_with(
        "http://api",
        "doc-1",
        "# Doc",
        markdown_already_on_oss=True,
        ctx=ctx,
    )
    mock_complete.assert_called_once()
    mock_complete.assert_called_with("http://api", "job-1", ctx, parse_result=result)
    mock_patch.assert_called()


@patch("openkms_cli.pipeline.post_ingest.post_pipeline_version", return_value=True)
@patch("openkms_cli.pipeline.post_ingest.put_document_markdown")
@patch("openkms_cli.pipeline.post_ingest.resolve_api_request_auth", return_value=({}, None, True))
def test_sync_markdown_skips_api_put_when_already_on_oss(
    mock_auth: MagicMock,
    mock_put: MagicMock,
    mock_version: MagicMock,
) -> None:
    ok = sync_markdown_and_version(
        "http://api",
        "doc-1",
        "# Doc",
        markdown_already_on_oss=True,
    )
    assert ok is True
    mock_put.assert_not_called()
    mock_version.assert_called_once()


@patch("openkms_cli.pipeline.post_ingest.fail_job")
@patch("openkms_cli.pipeline.post_ingest.write_hash_dir_artifacts")
def test_finalize_job_artifacts_fails_empty_cloud_ocr_markdown(
    mock_write: MagicMock,
    mock_fail: MagicMock,
    tmp_path: Path,
) -> None:
    hash_dir = tmp_path / "hash"
    hash_dir.mkdir()
    ctx = {
        "document": {"id": "doc-1", "name": "photo.jpg"},
        "input_uri": "s3://bucket/documents/abc/original.jpg",
        "s3_prefix": "documents/abc",
        "pipeline_name": "paddleocr-doc-parse",
    }
    result = {"markdown": "", "file_hash": "a" * 64, "page_count": 1}

    try:
        finalize_job_artifacts(
            api="http://api",
            job_id="job-1",
            ctx=ctx,
            result=result,
            hash_dir=hash_dir,
            ingest_kind=IngestKind.CLOUD_OCR,
            original_content=b"jpeg-bytes",
        )
        assert False, "expected SystemExit"
    except SystemExit as exc:
        assert exc.code == 1

    mock_fail.assert_called_once()
    assert "no markdown" in mock_fail.call_args[0][2].lower()


def test_upload_hash_dir_to_document_bundle_mirrors_when_prefixes_differ(tmp_path: Path) -> None:
    hash_dir = tmp_path / "bundle"
    hash_dir.mkdir()
    (hash_dir / "markdown.md").write_text("# Doc", encoding="utf-8")

    ctx = {
        "s3_prefix": "eval-runs/run-1/items/item-1",
        "document_s3_prefix": "datasets/ds-1/item-1",
        "document": {"s3_key": "datasets/ds-1/item-1/original.jpg"},
    }

    with patch("openkms_cli.pipeline.post_ingest.upload_hash_dir", side_effect=[1, 1]) as mock_upload:
        count = upload_hash_dir_to_document_bundle(
            hash_dir,
            ctx,
            bucket="bucket",
            endpoint_url=None,
            access_key="ak",
            secret_key="sk",
            region="cn",
        )

    assert count == 2
    assert mock_upload.call_count == 2
    assert mock_upload.call_args_list[0].kwargs["prefix"] == "eval-runs/run-1/items/item-1"
    assert mock_upload.call_args_list[1].kwargs["prefix"] == "datasets/ds-1/item-1"


def test_upload_hash_dir_to_document_bundle_skips_mirror_for_eval_job(tmp_path: Path) -> None:
    hash_dir = tmp_path / "bundle"
    hash_dir.mkdir()
    (hash_dir / "markdown.md").write_text("# Doc", encoding="utf-8")

    ctx = {
        "s3_prefix": "eval-runs/run-1/items/item-1",
        "document_s3_prefix": "datasets/ds-1/item-1",
        "eval_run_item_id": "eval-item-1",
        "document": {"s3_key": "datasets/ds-1/item-1/original.jpg"},
    }

    with patch("openkms_cli.pipeline.post_ingest.upload_hash_dir", return_value=1) as mock_upload:
        count = upload_hash_dir_to_document_bundle(
            hash_dir,
            ctx,
            bucket="bucket",
            endpoint_url=None,
            access_key="ak",
            secret_key="sk",
            region="cn",
        )

    assert count == 1
    mock_upload.assert_called_once()
    assert mock_upload.call_args.kwargs["prefix"] == "eval-runs/run-1/items/item-1"


@patch("openkms_cli.pipeline.post_ingest.post_pipeline_version", return_value=True)
@patch("openkms_cli.pipeline.post_ingest.put_document_markdown")
@patch("openkms_cli.pipeline.post_ingest.resolve_api_request_auth", return_value=({}, None, True))
def test_sync_markdown_skips_document_api_for_eval_job(
    mock_auth: MagicMock,
    mock_put: MagicMock,
    mock_version: MagicMock,
) -> None:
    ok = sync_markdown_and_version(
        "http://api",
        "doc-1",
        "# Doc",
        markdown_already_on_oss=True,
        ctx={"eval_run_item_id": "eval-item-1"},
    )
    assert ok is True
    mock_auth.assert_not_called()
    mock_put.assert_not_called()
    mock_version.assert_not_called()


def test_is_eval_run_job() -> None:
    assert is_eval_run_job({"eval_run_item_id": "abc"}) is True
    assert is_eval_run_job({"eval_run_item_id": ""}) is False
    assert is_eval_run_job({}) is False
