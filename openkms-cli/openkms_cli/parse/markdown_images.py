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
_PLATFORM_ASSET_PATH_RE = re.compile(
    r"^(?:https?://[^/]+)?/api/knowledge/documents/[0-9a-f-]{36}/assets/.+",
    re.I,
)
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


def _write_markdown_image_bytes(
    raw: bytes,
    *,
    file_hash: str,
    out_dir: Path,
    preferred_name: str,
    used_names: set[str],
) -> str | None:
    if not raw:
        return None
    md_dir = out_dir / "markdown_out"
    stem = Path(preferred_name).stem or "img"
    suffix = Path(preferred_name).suffix.lower() or ".png"
    if suffix not in _IMAGE_EXTS:
        suffix = ".jpg"
    candidate = f"{stem}{suffix}"
    n = 1
    while candidate in used_names:
        candidate = f"{stem}_{n}{suffix}"
        n += 1
    used_names.add(candidate)
    md_dir.mkdir(parents=True, exist_ok=True)
    (md_dir / candidate).write_bytes(raw)
    rel = f"markdown_out/{candidate}"
    logger.info(
        "Materialized markdown image file_hash=%s rel=%s bytes=%s",
        file_hash[:12],
        rel,
        len(raw),
    )
    return rel


def _iter_http_strings(value: Any) -> list[str]:
    found: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, str):
            if node.startswith(("http://", "https://")):
                found.append(node)
            return
        if isinstance(node, dict):
            for item in node.values():
                walk(item)
            return
        if isinstance(node, list):
            for item in node:
                walk(item)

    walk(value)
    return found


def build_basename_http_url_map(*sources: Any) -> dict[str, str]:
    """Map image basenames (hash.jpg) to downloadable http(s) URLs discovered in API payloads."""
    mapping: dict[str, str] = {}
    for source in sources:
        for url in _iter_http_strings(source):
            basename = Path(unquote(urlparse(url).path)).name
            if not basename or not _SAFE_NAME_RE.match(basename):
                continue
            mapping.setdefault(basename, url)
    return mapping


def materialize_relative_markdown_images(
    markdown: str,
    url_by_basename: dict[str, str],
    *,
    file_hash: str,
    out_dir: Path,
    session: requests.Session | None = None,
) -> str:
    """Download relative markdown image refs when a basename→URL map is available (DocMind REFERENCED)."""
    if not markdown or not url_by_basename:
        return markdown

    ref_to_rel: dict[str, str] = {}
    used_names: set[str] = set()

    for match in _MD_IMAGE_RE.finditer(markdown):
        alt = match.group(1) or ""
        ref = (match.group(2) or "").strip()
        if not ref or ref in ref_to_rel:
            continue
        if ref.startswith(("http://", "https://", "data:")):
            continue
        normalized = ref.replace("\\", "/").lstrip("./")
        basename = Path(normalized).name
        if not basename or not _SAFE_NAME_RE.match(basename):
            continue
        url = url_by_basename.get(basename)
        if not url:
            continue
        try:
            raw, content_type = _download_image(url, session=session)
        except Exception as exc:
            logger.warning(
                "Failed to download relative markdown image %s via %s: %s",
                ref,
                url[:120],
                exc,
            )
            continue
        preferred = basename
        if content_type and Path(preferred).suffix.lower() not in _IMAGE_EXTS:
            ext = _ext_from_content_type(content_type)
            if ext:
                preferred = f"{Path(preferred).stem}{ext}"
        rel = _write_markdown_image_bytes(
            raw,
            file_hash=file_hash,
            out_dir=out_dir,
            preferred_name=preferred,
            used_names=used_names,
        )
        if rel:
            ref_to_rel[ref] = rel

    return rewrite_markdown_image_urls(markdown, ref_to_rel)


def materialize_docmind_markdown_images(
    markdown: str,
    *,
    file_hash: str,
    out_dir: Path,
    layouts: list[dict[str, Any]] | None = None,
    status_data: dict[str, Any] | None = None,
    markdown_export: str | None = None,
    session: requests.Session | None = None,
) -> str:
    """
    Materialize DocMind markdown images: https refs in markdown, plus relative hash.jpg refs
    resolved from layout/status/export payloads.
    """
    if not markdown:
        return markdown

    url_by_basename = build_basename_http_url_map(layouts, status_data, markdown_export, markdown)

    if markdown_export and "://" in markdown_export:
        materialize_remote_markdown_images(
            markdown_export,
            file_hash=file_hash,
            out_dir=out_dir,
            session=session,
        )

    markdown = materialize_remote_markdown_images(
        markdown,
        file_hash=file_hash,
        out_dir=out_dir,
        session=session,
    )
    markdown = materialize_relative_markdown_images(
        markdown,
        url_by_basename,
        file_hash=file_hash,
        out_dir=out_dir,
        session=session,
    )
    return link_relative_refs_to_existing_bundle_files(markdown, out_dir)


def link_relative_refs_to_existing_bundle_files(markdown: str, out_dir: Path) -> str:
    """Rewrite relative image refs when bytes already exist under markdown_out/."""
    md_dir = out_dir / "markdown_out"
    if not markdown or not md_dir.is_dir():
        return markdown

    ref_to_rel: dict[str, str] = {}
    for match in _MD_IMAGE_RE.finditer(markdown):
        ref = (match.group(2) or "").strip()
        if not ref or ref in ref_to_rel:
            continue
        if ref.startswith(("http://", "https://", "data:")):
            continue
        normalized = ref.replace("\\", "/").lstrip("./")
        basename = Path(normalized).name
        if basename and (md_dir / basename).is_file():
            ref_to_rel[ref] = f"markdown_out/{basename}"
            continue
        if normalized.startswith("markdown_out/") and (out_dir / normalized).is_file():
            ref_to_rel[ref] = normalized

    return rewrite_markdown_image_urls(markdown, ref_to_rel)


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

        name = _guess_name(alt, url, counter, content_type)
        rel = _write_markdown_image_bytes(
            raw,
            file_hash=file_hash,
            out_dir=out_dir,
            preferred_name=name,
            used_names=used_names,
        )
        if not rel:
            continue
        url_to_rel[url] = rel
        counter += 1

    return rewrite_markdown_image_urls(markdown, url_to_rel)


def platform_asset_url(
    document_id: str,
    bundle_rel: str,
    *,
    api_url: str | None = None,
) -> str:
    rel = bundle_rel.replace("\\", "/").lstrip("./").lstrip("/")
    path = f"/api/knowledge/documents/{document_id}/assets/{rel}"
    if api_url:
        return f"{api_url.rstrip('/')}{path}"
    return path


def rewrite_markdown_to_platform_asset_urls(
    markdown: str,
    document_id: str,
    *,
    api_url: str | None = None,
) -> str:
    """Rewrite bundle-relative image refs to stable platform asset HTTP URLs."""
    if not markdown or not document_id:
        return markdown

    def _replace(match: re.Match[str]) -> str:
        alt = match.group(1) or ""
        src = (match.group(2) or "").strip()
        if not src or _PLATFORM_ASSET_PATH_RE.match(src):
            return match.group(0)
        if src.startswith(("http://", "https://", "data:")):
            return match.group(0)
        rel = src.replace("\\", "/").lstrip("./")
        if not rel or ".." in rel.split("/"):
            return match.group(0)
        new_url = platform_asset_url(document_id, rel, api_url=api_url)
        return f"![{alt}]({new_url})"

    return _MD_IMAGE_RE.sub(_replace, markdown)


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
