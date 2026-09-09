"""Materialize capture post-process artifacts into a document markdown bundle."""

from __future__ import annotations

import json
from typing import Any

from openkms_cli.core.auth import try_api_request_auth
from openkms_cli.pipeline.api_client import put_document_markdown


def resolve_index_content(ctx: dict[str, Any]) -> dict[str, Any]:
    raw = ctx.get("index_content")
    if isinstance(raw, dict):
        return raw
    return {"audio": "combined"}


def _read_text(s3_client: Any, bucket: str, key: str) -> str | None:
    if not key:
        return None
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        return response["Body"].read().decode("utf-8", errors="replace")
    except Exception:
        return None


def _read_json(s3_client: Any, bucket: str, key: str) -> dict[str, Any] | None:
    raw = _read_text(s3_client, bucket, key)
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def build_combined_markdown(
    *,
    capture: dict[str, Any],
    summary_md: str | None,
    extraction: dict[str, Any] | None,
    structured: dict[str, Any] | None,
) -> str:
    title = str(capture.get("title") or "Capture").strip() or "Capture"
    parts = [f"# {title}", ""]

    brief = str(capture.get("brief") or "").strip()
    if brief:
        parts.extend(["## Brief", "", brief, ""])

    if summary_md and summary_md.strip():
        parts.extend(["## Summary", "", summary_md.strip(), ""])

    if extraction:
        parts.extend(["## Knowledge extraction", ""])
        points = extraction.get("knowledge_points")
        if isinstance(points, list) and points:
            for item in points:
                if isinstance(item, dict):
                    text = str(item.get("text") or item.get("summary") or "").strip()
                    if text:
                        parts.append(f"- {text}")
                elif isinstance(item, str) and item.strip():
                    parts.append(f"- {item.strip()}")
            parts.append("")
        else:
            parts.append("```json")
            parts.append(json.dumps(extraction, ensure_ascii=False, indent=2))
            parts.append("```")
            parts.append("")

    if structured:
        topics = structured.get("topics")
        if isinstance(topics, list) and topics:
            parts.extend(["## Topics", ""])
            for topic in topics:
                if not isinstance(topic, dict):
                    continue
                label = str(topic.get("label") or topic.get("title") or "Topic").strip()
                preview = str(topic.get("preview") or "").strip()
                parts.append(f"### {label}")
                if preview:
                    parts.append(preview)
                parts.append("")

    return "\n".join(parts).strip() + "\n"


def build_materialized_markdown(
    *,
    ctx: dict[str, Any],
    s3_client: Any,
    bucket: str,
    artifact_keys: dict[str, str],
) -> str:
    index_content = resolve_index_content(ctx)
    mode = str(index_content.get("audio") or "combined").strip().lower()

    summary_md = _read_text(s3_client, bucket, str(artifact_keys.get("summary") or ""))
    extraction = _read_json(s3_client, bucket, str(artifact_keys.get("extraction") or ""))
    structured = _read_json(s3_client, bucket, str(artifact_keys.get("structured_transcript") or ""))
    capture = ctx.get("capture") if isinstance(ctx.get("capture"), dict) else {}

    if mode == "summary":
        if not summary_md:
            raise RuntimeError("index_content.audio=summary requires summary.md artifact")
        return summary_md.strip() + "\n"

    return build_combined_markdown(
        capture=capture,
        summary_md=summary_md,
        extraction=extraction,
        structured=structured,
    )


def materialize_capture_for_index(
    *,
    ctx: dict[str, Any],
    s3_client: Any,
    bucket: str,
    api_url: str,
) -> None:
    if not ctx.get("materialize_for_index"):
        return

    index_document_id = str(ctx.get("index_document_id") or "").strip()
    if not index_document_id:
        raise RuntimeError("materialize_for_index requires index_document_id")

    file_hash = str(ctx.get("index_file_hash") or "").strip()
    if not file_hash:
        raise RuntimeError("materialize_for_index requires index_file_hash")

    artifact_keys = ctx.get("artifact_keys") if isinstance(ctx.get("artifact_keys"), dict) else {}
    markdown = build_materialized_markdown(
        ctx=ctx,
        s3_client=s3_client,
        bucket=bucket,
        artifact_keys=artifact_keys,
    )

    markdown_key = f"documents/{file_hash}/markdown.md"
    s3_client.put_object(
        Bucket=bucket,
        Key=markdown_key,
        Body=markdown.encode("utf-8"),
        ContentType="text/markdown; charset=utf-8",
    )

    cred = try_api_request_auth()
    if cred is None:
        raise RuntimeError("API authentication required to sync materialized markdown")
    auth_headers, basic = cred
    ok, _, _ = put_document_markdown(api_url, index_document_id, markdown, auth_headers, basic)
    if not ok:
        raise RuntimeError(f"Failed to sync markdown for document {index_document_id}")
