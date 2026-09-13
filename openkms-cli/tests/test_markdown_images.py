"""Tests for markdown image materialization."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from openkms_cli.parse.markdown_images import (
    build_basename_http_url_map,
    collect_relative_markdown_image_paths,
    link_relative_refs_to_existing_bundle_files,
    materialize_relative_markdown_images,
    materialize_remote_markdown_images,
    platform_asset_url,
    rewrite_markdown_image_urls,
    rewrite_markdown_to_platform_asset_urls,
)

DOC_ID = "550e8400-e29b-41d4-a716-446655440000"


def test_rewrite_markdown_image_urls():
    md = "![img](https://bos.example/a.png) text https://bos.example/a.png"
    out = rewrite_markdown_image_urls(md, {"https://bos.example/a.png": "markdown_out/a.png"})
    assert "markdown_out/a.png" in out
    assert "https://bos.example/a.png" not in out


def test_collect_relative_markdown_image_paths():
    md = "![a](markdown_out/a.png) ![b](https://x/y.png) ![c](./foo.jpg) ![d](markdown_out/a.png)"
    assert collect_relative_markdown_image_paths(md) == ["markdown_out/a.png", "foo.jpg"]


def test_materialize_remote_markdown_images(tmp_path: Path):
    md = (
        "Hello\n\n"
        "![a601ed764008139b74e39ba7c6337772.jpeg](http://docmind.example/4.png?Expires=1)\n"
        "![same](http://docmind.example/4.png?Expires=1)\n"
    )
    mock_resp = MagicMock()
    mock_resp.content = b"\x89PNG\r\n"
    mock_resp.headers = {"Content-Type": "image/png"}
    mock_resp.raise_for_status = MagicMock()

    with patch("openkms_cli.parse.markdown_images.requests.get", return_value=mock_resp) as mock_get:
        out = materialize_remote_markdown_images(
            md,
            file_hash="abc123",
            out_dir=tmp_path,
        )

    assert mock_get.call_count == 1
    assert "http://docmind.example/4.png?Expires=1" not in out
    assert "markdown_out/a601ed764008139b74e39ba7c6337772.jpeg" in out
    saved = tmp_path / "markdown_out" / "a601ed764008139b74e39ba7c6337772.jpeg"
    assert saved.read_bytes() == b"\x89PNG\r\n"


def test_platform_asset_url():
    rel_path = platform_asset_url(DOC_ID, "markdown_out/foo.jpg")
    assert rel_path == f"/api/knowledge/documents/{DOC_ID}/assets/markdown_out/foo.jpg"
    abs_path = platform_asset_url(
        DOC_ID,
        "./markdown_out/foo.jpg",
        api_url="https://cow-platform.vercel.app",
    )
    assert abs_path.startswith("https://cow-platform.vercel.app/api/knowledge/documents/")


def test_rewrite_markdown_to_platform_asset_urls():
    md = "![a](markdown_out/a.png) ![b](https://x/y.png) text"
    out = rewrite_markdown_to_platform_asset_urls(
        md,
        DOC_ID,
        api_url="https://api.example.com",
    )
    assert platform_asset_url(DOC_ID, "markdown_out/a.png", api_url="https://api.example.com") in out
    assert "https://x/y.png" in out
    already = rewrite_markdown_to_platform_asset_urls(out, DOC_ID, api_url="https://api.example.com")
    assert already == out


def test_build_basename_http_url_map():
    layouts = [{"imageUrl": "https://docmind.example/out/0f74a6c5b368a3991c3cde93b4bf3e7e.jpg"}]
    mapping = build_basename_http_url_map(layouts)
    assert mapping["0f74a6c5b368a3991c3cde93b4bf3e7e.jpg"].startswith("https://")


def test_build_basename_http_url_map_from_markdown_content():
    layouts = [
        {
            "markdownContent": (
                "![f29999a192678ef083fa7c284481ca61.jpg]"
                "(http://docmind.example/out/f29999a192678ef083fa7c284481ca61.jpeg)"
            ),
        }
    ]
    mapping = build_basename_http_url_map(layouts)
    assert mapping["f29999a192678ef083fa7c284481ca61.jpeg"].startswith("http://")


def test_materialize_relative_markdown_images(tmp_path: Path):
    md = "![shot](0f74a6c5b368a3991c3cde93b4bf3e7e.jpg)"
    mock_resp = MagicMock()
    mock_resp.content = b"\xff\xd8\xff"
    mock_resp.headers = {"Content-Type": "image/jpeg"}
    mock_resp.raise_for_status = MagicMock()
    url_map = {
        "0f74a6c5b368a3991c3cde93b4bf3e7e.jpg": "https://docmind.example/out/0f74a6c5b368a3991c3cde93b4bf3e7e.jpg",
    }
    with patch("openkms_cli.parse.markdown_images.requests.get", return_value=mock_resp):
        out = materialize_relative_markdown_images(
            md,
            url_map,
            file_hash="abc",
            out_dir=tmp_path,
        )
    assert "markdown_out/0f74a6c5b368a3991c3cde93b4bf3e7e.jpg" in out
    assert (tmp_path / "markdown_out" / "0f74a6c5b368a3991c3cde93b4bf3e7e.jpg").is_file()


def test_link_relative_refs_to_existing_bundle_files(tmp_path: Path):
    md_dir = tmp_path / "markdown_out"
    md_dir.mkdir(parents=True)
    (md_dir / "abc.jpg").write_bytes(b"jpeg")
    md = "![x](abc.jpg)"
    out = link_relative_refs_to_existing_bundle_files(md, tmp_path)
    assert "markdown_out/abc.jpg" in out


def test_materialize_keeps_url_when_download_fails(tmp_path: Path):
    md = "![x](http://docmind.example/missing.png)"
    with patch(
        "openkms_cli.parse.markdown_images.requests.get",
        side_effect=RuntimeError("boom"),
    ):
        out = materialize_remote_markdown_images(md, file_hash="abc", out_dir=tmp_path)
    assert out == md
    assert not (tmp_path / "markdown_out").exists()
