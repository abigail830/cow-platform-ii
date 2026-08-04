"""Download remote images embedded in parse markdown and rewrite to bundle-relative paths."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import requests

logger = logging.getLogger("openkms_cli.markdown_images")

_MD_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+\.(?:jpe?g|png|gif|webp|bmp|tif|tiff)$", re.I)
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"}


def rewrite_markdown_image_urls(markdown: str, url_to_rel: dict[str, str]) -> str:
    if not url_to_rel:
        return markdown
    out = markdown
    for url, rel in sorted(url_to_rel.items(), key=lambda kv: len(kv[0]), reverse=True):
        out = out.replace(url, rel)
    return out


def _ext_from_content_type(content_type: str | None) -> str | None:
    if not content_type:
        return None
    mime = content_type.split(";", 1)[0].strip().lower()
    mapping = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/bmp": ".bmp",
        "image/tiff": ".tiff",
    }
    return mapping.get(mime)


def _guess_name(alt: str, url: str, counter: int, content_type: str | None) -> str:
    alt_name = Path(alt.strip()).name if alt.strip() else ""
    path_name = Path(unquote(urlparse(url).path)).name
    preferred = alt_name if _SAFE_NAME_RE.match(alt_name or "") else ""
    if not preferred and path_name:
        suffix = Path(path_name).suffix.lower()
        if suffix in _IMAGE_EXTS:
            preferred = path_name

    ext = _ext_from_content_type(content_type)
    if preferred:
        if ext and Path(preferred).suffix.lower() not in _IMAGE_EXTS:
            preferred = f"{preferred}{ext}"
        return preferred

    return f"img_{counter}{ext or '.png'}"


def _download_image(url: str, *, session: requests.Session | None = None) -> tuple[bytes, str | None]:
    http = session or requests
    resp = http.get(url, timeout=120)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type")


def materialize_remote_markdown_images(
    markdown: str,
    *,
    file_hash: str,
    out_dir: Path,
    session: requests.Session | None = None,
) -> str:
    """
    Download http(s) images referenced by markdown into ``markdown_out/`` and rewrite
    those URLs to bundle-relative paths (``markdown_out/<name>``).

    Local / already-relative refs are left unchanged. Failed downloads keep the
    original URL (logged) so parse still completes.
    """
    if not markdown or "://" not in markdown:
        return markdown

    md_dir = out_dir / "markdown_out"
    url_to_rel: dict[str, str] = {}
    used_names: set[str] = set()
    counter = 0

    for match in _MD_IMAGE_RE.finditer(markdown):
        alt = match.group(1) or ""
        url = (match.group(2) or "").strip()
        if not url.startswith(("http://", "https://")):
            continue
        if url in url_to_rel:
            continue

        try:
            raw, content_type = _download_image(url, session=session)
        except Exception as exc:
            logger.warning("Failed to download markdown image %s: %s", url[:120], exc)
            continue
        if not raw:
            continue

        name = _guess_name(alt, url, counter, content_type)
        stem = Path(name).stem
        suffix = Path(name).suffix.lower() or ".png"
        candidate = f"{stem}{suffix}"
        n = 1
        while candidate in used_names:
            candidate = f"{stem}_{n}{suffix}"
            n += 1
        used_names.add(candidate)

        md_dir.mkdir(parents=True, exist_ok=True)
        (md_dir / candidate).write_bytes(raw)
        rel = f"markdown_out/{candidate}"
        url_to_rel[url] = rel
        counter += 1
        logger.info(
            "Materialized markdown image file_hash=%s rel=%s bytes=%s",
            file_hash[:12],
            rel,
            len(raw),
        )

    return rewrite_markdown_image_urls(markdown, url_to_rel)


def collect_relative_markdown_image_paths(markdown: str) -> list[str]:
    """Return unique relative image paths referenced by markdown image syntax."""
    paths: list[str] = []
    seen: set[str] = set()
    for match in _MD_IMAGE_RE.finditer(markdown or ""):
        url = (match.group(2) or "").strip()
        if not url or url.startswith(("http://", "https://", "data:")):
            continue
        normalized = url.lstrip("./")
        if normalized in seen:
            continue
        seen.add(normalized)
        paths.append(normalized)
    return paths


# Re-export typing helper for callers that pass through Any session-like objects.
SessionLike = Any
