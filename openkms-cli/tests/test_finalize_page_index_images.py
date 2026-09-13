"""Integration: page index build must not clobber materialized markdown images."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from openkms_cli.ingest.kinds import IngestKind
from openkms_cli.parse.markdown_images import platform_asset_url
from openkms_cli.pipeline.post_ingest import build_page_index, write_hash_dir_artifacts

DOC_ID = "550e8400-e29b-41d4-a716-446655440000"


def test_build_page_index_preserves_platform_image_urls(tmp_path: Path) -> None:
    layouts = [
        {
            "uniqueId": "a",
            "type": "title",
            "subType": "para_title",
            "text": "Section",
            "level": 0,
            "index": 0,
            "pageNum": 0,
            "markdownContent": "# Section\n",
        },
        {
            "uniqueId": "b",
            "type": "figure",
            "subType": "pic",
            "text": "",
            "level": 1,
            "index": 1,
            "pageNum": 0,
            "markdownContent": (
                "![f29999a192678ef083fa7c284481ca61.jpg]"
                "(http://docmind.example/out/f29999a192678ef083fa7c284481ca61.jpeg)"
            ),
        },
    ]
    platform_url = platform_asset_url(
        DOC_ID,
        "markdown_out/f29999a192678ef083fa7c284481ca61.jpg",
        api_url="https://api.example.com",
    )
    markdown = f'# Section\n\n![img]({platform_url})\n'
    result = {
        "markdown": markdown,
        "file_hash": "abc",
        "aliyun_layouts": layouts,
        "parsing_res_list": [],
        "layout_det_res": [],
        "page_count": 1,
    }

    hash_dir = tmp_path / "abc"
    hash_dir.mkdir()
    write_hash_dir_artifacts(
        hash_dir=hash_dir,
        result=result,
        original_content=b"doc",
        original_basename="original.docx",
    )

    build_page_index(
        hash_dir,
        ingest_kind=IngestKind.CLOUD_OCR,
        provider="aliyun",
        layouts=layouts,
        page_index_strategy="aliyun-layouts",
        doc_name="doc",
    )

    assert platform_url in (hash_dir / "markdown.md").read_text(encoding="utf-8")
    assert (hash_dir / "page_index.json").is_file()
    tree = json.loads((hash_dir / "page_index.json").read_text(encoding="utf-8"))
    assert tree["strategy"] == "aliyun-layouts"
    assert tree["structure"][0]["line_num"] == 1


@patch("openkms_cli.pipeline.post_ingest.patch_job")
@patch("openkms_cli.pipeline.post_ingest.complete_job_after_parse")
@patch("openkms_cli.pipeline.post_ingest.sync_markdown_and_version", return_value=True)
@patch("openkms_cli.pipeline.post_ingest.upload_hash_dir_to_document_bundle", return_value=3)
def test_finalize_job_artifacts_uploads_platform_image_markdown(
    mock_upload: MagicMock,
    mock_sync: MagicMock,
    mock_complete: MagicMock,
    mock_patch: MagicMock,
    tmp_path: Path,
) -> None:
    from openkms_cli.pipeline.post_ingest import finalize_job_artifacts

    platform_url = platform_asset_url(
        DOC_ID,
        "markdown_out/f29999a192678ef083fa7c284481ca61.jpg",
        api_url="https://api.example.com",
    )
    layouts = [
        {
            "uniqueId": "a",
            "type": "title",
            "subType": "para_title",
            "text": "Section",
            "level": 0,
            "index": 0,
            "pageNum": 0,
            "markdownContent": "# Section\n",
        },
    ]
    hash_dir = tmp_path / "hash"
    hash_dir.mkdir()
    ctx = {
        "document": {"id": DOC_ID, "name": "doc.docx", "file_hash": "a" * 64},
        "input_uri": "s3://bucket/documents/abc/original.docx",
        "s3_prefix": f"documents/{'a' * 64}",
        "pipeline_name": "aliyun-docmind-parse",
        "config_yaml": "metadata_extract:\n  enabled: false\n",
    }
    result = {
        "markdown": f"![img](markdown_out/f29999a192678ef083fa7c284481ca61.jpg)\n",
        "file_hash": "a" * 64,
        "aliyun_layouts": layouts,
        "parsing_res_list": [],
        "layout_det_res": [],
        "page_count": 1,
    }

    finalize_job_artifacts(
        api="https://api.example.com",
        job_id="job-1",
        ctx=ctx,
        result=result,
        hash_dir=hash_dir,
        ingest_kind=IngestKind.CLOUD_OCR,
        page_index_strategy="aliyun-layouts",
        provider="aliyun",
        original_content=b"doc",
    )

    uploaded_markdown = (hash_dir / "markdown.md").read_text(encoding="utf-8")
    assert platform_url in uploaded_markdown
    assert "docmind.example" not in uploaded_markdown
    mock_sync.assert_called_once()
    assert platform_url in mock_sync.call_args[0][2]
