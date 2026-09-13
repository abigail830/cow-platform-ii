"""Materialize capture post-process artifacts into a document markdown bundle."""

from __future__ import annotations

from typing import Any

from openkms_cli.core.auth import try_api_request_auth
from openkms_cli.pipeline.api_client import put_document_markdown
from openkms_cli.pipeline.capture_merge import build_combined_transcript


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


def build_combined_markdown(
    *,
    capture: dict[str, Any],
    summary_md: str | None,
    transcript_text: str | None,
) -> str:
    title = str(capture.get("title") or "Capture").strip() or "Capture"
    parts = [f"# {title}", ""]

    if summary_md and summary_md.strip():
        parts.extend(["## Summary", "", summary_md.strip(), ""])

    if transcript_text and transcript_text.strip():
        parts.extend(["## Transcript", "", transcript_text.strip(), ""])

    if len(parts) <= 2:
        raise RuntimeError("combined markdown requires summary or transcript content")

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
    capture = ctx.get("capture") if isinstance(ctx.get("capture"), dict) else {}
    segments = ctx.get("segments") if isinstance(ctx.get("segments"), list) else []

    if mode == "summary":
        if not summary_md:
            raise RuntimeError("index_content.audio=summary requires summary.md artifact")
        return summary_md.strip() + "\n"

    def transcript_loader(key: str) -> str:
        return _read_text(s3_client, bucket, key) or ""

    transcript_text = build_combined_transcript(segments, transcript_loader=transcript_loader)

    return build_combined_markdown(
        capture=capture,
        summary_md=summary_md,
        transcript_text=transcript_text or None,
    )


def write_capture_markdown_artifact(
    *,
    ctx: dict[str, Any],
    s3_client: Any,
    bucket: str,
    artifact_keys: dict[str, str],
) -> str:
    """Build combined markdown and PUT under captures/{id}/markdown.md."""
    markdown_key = str(artifact_keys.get("markdown") or "").strip()
    if not markdown_key:
        raise RuntimeError("artifact_keys.markdown is required")

    markdown = build_materialized_markdown(
        ctx=ctx,
        s3_client=s3_client,
        bucket=bucket,
        artifact_keys=artifact_keys,
    )
    s3_client.put_object(
        Bucket=bucket,
        Key=markdown_key,
        Body=markdown.encode("utf-8"),
        ContentType="text/markdown; charset=utf-8",
    )
    return markdown


def materialize_capture_for_index(
    *,
    ctx: dict[str, Any],
    s3_client: Any,
    bucket: str,
    api_url: str,
    markdown: str | None = None,
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
    body = markdown or build_materialized_markdown(
        ctx=ctx,
        s3_client=s3_client,
        bucket=bucket,
        artifact_keys=artifact_keys,
    )

    markdown_key = f"documents/{file_hash}/markdown.md"
    s3_client.put_object(
        Bucket=bucket,
        Key=markdown_key,
        Body=body.encode("utf-8"),
        ContentType="text/markdown; charset=utf-8",
    )

    cred = try_api_request_auth()
    if cred is None:
        raise RuntimeError("API authentication required to sync materialized markdown")
    auth_headers, basic = cred
    ok, _, _ = put_document_markdown(api_url, index_document_id, body, auth_headers, basic)
    if not ok:
        raise RuntimeError(f"Failed to sync markdown for document {index_document_id}")
