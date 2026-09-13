#!/usr/bin/env python3
"""Empirical check: DocMind markdown image refs + OSS bundle sidecars.

Prints only structural diagnostics (no secrets). Run from openkms-cli/:
  python scripts/verify_docmind_markdown_images.py [--submit /path/to.pdf]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

# Ensure package import
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from openkms_cli.core.settings import get_cli_settings
from openkms_cli.parse.markdown_images import build_basename_http_url_map
from openkms_cli.pipeline.storage import get_s3_client
from openkms_cli.providers.aliyun.docmind import (
    fetch_all_layouts,
    layouts_to_markdown,
    markdown_from_status,
    presign_s3_get_url,
    query_doc_parser_status,
    submit_doc_parser_job,
)

_MD_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)")


def classify_ref(ref: str) -> str:
    ref = ref.strip()
    if ref.startswith(("http://", "https://")):
        if "docmind-api" in ref or "aliyuncs.com" in ref:
            return "docmind_https"
        if "/api/knowledge/documents/" in ref and "/assets/" in ref:
            return "platform_url"
        return "other_https"
    if ref.startswith("data:"):
        return "data"
    if ref.startswith("markdown_out/"):
        return "bundle_rel"
    return "bare_relative"


def sample_image_refs(markdown: str, limit: int = 8) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for m in _MD_IMAGE_RE.finditer(markdown or ""):
        ref = (m.group(2) or "").strip()
        if ref:
            out.append((classify_ref(ref), ref[:140]))
        if len(out) >= limit:
            break
    return out


def list_recent_markdown_keys(client: Any, bucket: str, max_docs: int = 5) -> list[str]:
    paginator = client.get_paginator("list_objects_v2")
    keys: list[tuple[str, Any]] = []
    for page in paginator.paginate(Bucket=bucket, Prefix="documents/"):
        for obj in page.get("Contents") or []:
            key = obj["Key"]
            if key.endswith("/markdown.md"):
                keys.append((key, obj.get("LastModified")))
    keys.sort(key=lambda x: x[1] or "", reverse=True)
    return [k for k, _ in keys[:max_docs]]


def inspect_oss_markdown(client: Any, bucket: str, key: str) -> dict[str, Any]:
    body = client.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8", errors="replace")
    parts = key.split("/")
    file_hash = parts[1] if len(parts) > 2 else "?"
    out_prefix = f"documents/{file_hash}/markdown_out/"
    out_resp = client.list_objects_v2(Bucket=bucket, Prefix=out_prefix, MaxKeys=50)
    out_keys = [o["Key"] for o in out_resp.get("Contents") or [] if not o["Key"].endswith("/")]
    refs = sample_image_refs(body)
    kinds = {k for k, _ in refs}
    return {
        "oss_key": key,
        "file_hash_prefix": file_hash[:12],
        "markdown_chars": len(body),
        "image_ref_count": len(list(_MD_IMAGE_RE.finditer(body))),
        "ref_kinds": sorted(kinds),
        "sample_refs": refs,
        "markdown_out_count": len(out_keys),
        "markdown_out_sample": [Path(k).name for k in out_keys[:6]],
    }


def run_docmind_live(file_path: Path, cfg: Any) -> dict[str, Any]:
    bucket = cfg.aws_bucket_name
    key = f"verify-docmind/{int(time.time())}/{file_path.name}"
    client = get_s3_client(cfg.aws_endpoint_url, cfg.aws_access_key_id, cfg.aws_secret_access_key, cfg.aws_region)
    client.upload_file(str(file_path), bucket, key)
    file_url = presign_s3_get_url(
        bucket=bucket,
        key=key,
        endpoint_url=cfg.aws_endpoint_url,
        access_key=cfg.aws_access_key_id,
        secret_key=cfg.aws_secret_access_key,
        region=cfg.aws_region,
        expires_in=cfg.oss_presign_ttl_seconds,
    )
    task_id = submit_doc_parser_job(
        file_url=file_url,
        file_name=file_path.name,
        access_key_id=cfg.aws_access_key_id,
        secret_access_key=cfg.aws_secret_access_key,
        endpoint=cfg.docmind_endpoint,
    )
    deadline = time.time() + cfg.async_max_wait_seconds
    status_data: dict[str, Any] = {}
    while time.time() < deadline:
        status_data = query_doc_parser_status(
            task_id,
            access_key_id=cfg.aws_access_key_id,
            secret_access_key=cfg.aws_secret_access_key,
            endpoint=cfg.docmind_endpoint,
        )
        st = (status_data.get("Status") or "").lower()
        if st == "success":
            break
        if st in {"fail", "failed"}:
            raise RuntimeError(f"DocMind failed: {status_data.get('Message') or status_data}")
        time.sleep(cfg.async_poll_interval_seconds)

    layouts = fetch_all_layouts(
        task_id,
        access_key_id=cfg.aws_access_key_id,
        secret_access_key=cfg.aws_secret_access_key,
        endpoint=cfg.docmind_endpoint,
    )
    markdown_export = markdown_from_status(status_data)
    layout_md = layouts_to_markdown(layouts)
    url_map = build_basename_http_url_map(layouts, status_data, markdown_export, layout_md)

    def layout_image_samples() -> list[str]:
        samples: list[str] = []
        for layout in layouts:
            md = (layout.get("markdownContent") or "").strip()
            if "![" in md:
                for m in _MD_IMAGE_RE.finditer(md):
                    samples.append((m.group(2) or "")[:160])
                    if len(samples) >= 6:
                        return samples
        return samples

    return {
        "task_id": task_id,
        "layout_count": len(layouts),
        "layout_markdown_chars": len(layout_md),
        "export_markdown_chars": len(markdown_export or ""),
        "export_has_https": bool(markdown_export and "://" in markdown_export),
        "layout_md_refs": sample_image_refs(layout_md),
        "export_md_refs": sample_image_refs(markdown_export or ""),
        "layout_inline_samples": layout_image_samples(),
        "basename_url_map_size": len(url_map),
        "basename_url_map_keys": sorted(url_map.keys())[:10],
        "status_output_types": [
            str(e.get("OutputType") or e.get("output_type"))
            for e in (status_data.get("OutputFormatResult") or [])
            if isinstance(e, dict)
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submit", type=Path, help="Optional local PDF/image to submit to DocMind")
    parser.add_argument("--oss-samples", type=int, default=5, help="Recent OSS markdown.md samples")
    args = parser.parse_args()

    cfg = get_cli_settings()
    if not cfg.aws_access_key_id or not cfg.aws_bucket_name:
        print("ERROR: OSS credentials/bucket not configured in openkms-cli/.env")
        return 1

    client = get_s3_client(
        cfg.aws_endpoint_url,
        cfg.aws_access_key_id,
        cfg.aws_secret_access_key,
        cfg.aws_region,
    )

    print("=== OSS recent markdown.md samples ===")
    try:
        keys = list_recent_markdown_keys(client, cfg.aws_bucket_name, args.oss_samples)
    except Exception as exc:
        print(f"OSS list failed: {exc}")
        keys = []

    if not keys:
        print("(no markdown.md found under documents/)")
    for key in keys:
        try:
            info = inspect_oss_markdown(client, cfg.aws_bucket_name, key)
            print(json.dumps(info, ensure_ascii=False, indent=2))
        except Exception as exc:
            print(json.dumps({"oss_key": key, "error": str(exc)}))

    if args.submit:
        if not args.submit.is_file():
            print(f"ERROR: file not found: {args.submit}")
            return 1
        print("\n=== Live DocMind submit ===")
        try:
            result = run_docmind_live(args.submit, cfg)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        except Exception as exc:
            print(f"DocMind live test failed: {exc}")
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
