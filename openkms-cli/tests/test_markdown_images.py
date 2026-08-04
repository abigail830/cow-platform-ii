"""Tests for markdown image materialization."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from openkms_cli.parse.markdown_images import (
    collect_relative_markdown_image_paths,
    materialize_remote_markdown_images,
    rewrite_markdown_image_urls,
)


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


def test_materialize_keeps_url_when_download_fails(tmp_path: Path):
    md = "![x](http://docmind.example/missing.png)"
    with patch(
        "openkms_cli.parse.markdown_images.requests.get",
        side_effect=RuntimeError("boom"),
    ):
        out = materialize_remote_markdown_images(md, file_hash="abc", out_dir=tmp_path)
    assert out == md
    assert not (tmp_path / "markdown_out").exists()
