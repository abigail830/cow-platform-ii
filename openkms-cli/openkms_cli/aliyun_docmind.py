"""Aliyun Document Mind (大模型版) parser via presigned OSS FileUrl."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .parse_result import validate_parse_result

logger = logging.getLogger("openkms_cli.aliyun_docmind")

_DEFAULT_LAYOUT_STEP = 300


class AliyunDocmindError(RuntimeError):
    """Raised when Aliyun Document Mind API fails."""


def _create_client(access_key_id: str, secret_access_key: str, endpoint: str):
    try:
        from alibabacloud_docmind_api20220711 import models as dm_models
        from alibabacloud_docmind_api20220711.client import Client as DocmindClient
        from alibabacloud_tea_openapi import models as open_api_models
    except ImportError as e:
        raise AliyunDocmindError(
            "Aliyun Document Mind SDK not installed. pip install openkms-cli[aliyun]"
        ) from e

    config = open_api_models.Config(
        access_key_id=access_key_id,
        access_key_secret=secret_access_key,
    )
    config.endpoint = endpoint
    return DocmindClient(config), dm_models


def presign_s3_get_url(
    *,
    bucket: str,
    key: str,
    endpoint_url: str | None,
    access_key: str,
    secret_key: str,
    region: str,
    expires_in: int,
) -> str:
    from .pipeline_cli import _get_s3_client

    client = _get_s3_client(endpoint_url, access_key, secret_key, region)
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )


def submit_doc_parser_job(
    *,
    file_url: str,
    file_name: str,
    access_key_id: str,
    secret_access_key: str,
    endpoint: str,
    enable_event_callback: bool = False,
) -> str:
    client, dm_models = _create_client(access_key_id, secret_access_key, endpoint)
    ext = Path(file_name).suffix.lower().lstrip(".")
    request = dm_models.SubmitDocParserJobRequest(
        file_url=file_url,
        file_name=file_name,
        file_name_extension=ext or None,
        llm_enhancement=False,
        enable_event_callback=enable_event_callback,
        output_format=["markdown"],
    )
    try:
        response = client.submit_doc_parser_job(request)
    except Exception as e:
        raise AliyunDocmindError(f"SubmitDocParserJob failed: {e}") from e

    body = response.body
    if body is None or body.data is None or not body.data.id:
        code = getattr(body, "code", None)
        message = getattr(body, "message", None) or str(body)
        raise AliyunDocmindError(f"SubmitDocParserJob returned no task id: {code} {message}")
    return str(body.data.id)


def query_doc_parser_status(
    task_id: str,
    *,
    access_key_id: str,
    secret_access_key: str,
    endpoint: str,
) -> dict[str, Any]:
    client, dm_models = _create_client(access_key_id, secret_access_key, endpoint)
    request = dm_models.QueryDocParserStatusRequest(id=task_id)
    try:
        response = client.query_doc_parser_status(request)
    except Exception as e:
        raise AliyunDocmindError(f"QueryDocParserStatus failed: {e}") from e

    body = response.body
    if body is None:
        raise AliyunDocmindError("QueryDocParserStatus returned empty body")
    data = body.data
    if data is None:
        code = getattr(body, "code", None)
        message = getattr(body, "message", None) or str(body)
        raise AliyunDocmindError(f"QueryDocParserStatus error: {code} {message}")

    if hasattr(data, "to_map"):
        return data.to_map()
    if isinstance(data, dict):
        return data
    return {"Status": getattr(data, "status", None)}


def _normalize_status(status: str | None) -> str:
    return (status or "").strip().lower()


def is_status_success(status_data: dict[str, Any]) -> bool:
    return _normalize_status(status_data.get("Status")) == "success"


def is_status_failed(status_data: dict[str, Any]) -> bool:
    status = _normalize_status(status_data.get("Status"))
    return status in {"fail", "failed"}


def is_status_pending(status_data: dict[str, Any]) -> bool:
    status = _normalize_status(status_data.get("Status"))
    return status in {"", "init", "processing"}


def _response_data_as_dict(data: Any) -> dict[str, Any]:
    if isinstance(data, dict):
        return data
    if hasattr(data, "to_map"):
        mapped = data.to_map()
        if isinstance(mapped, dict):
            return mapped
    return {}


def _layout_items_from_result_data(data: Any) -> list[Any]:
    mapped = _response_data_as_dict(data)
    layouts = mapped.get("layouts") or mapped.get("Layouts")
    if isinstance(layouts, list):
        return layouts
    return []


def markdown_from_status(status_data: dict[str, Any]) -> str | None:
    """When submit uses OutputFormat=markdown, full markdown may be a signed URL in status."""
    outputs = status_data.get("OutputFormatResult") or status_data.get("output_format_result") or []
    if not isinstance(outputs, list):
        return None
    import requests

    for entry in outputs:
        if not isinstance(entry, dict):
            continue
        output_type = str(entry.get("OutputType") or entry.get("output_type") or "").lower()
        url = entry.get("OutputFileUrl") or entry.get("output_file_url")
        if output_type == "markdown" and isinstance(url, str) and url.strip():
            resp = requests.get(url.strip(), timeout=300)
            resp.raise_for_status()
            return resp.text
    return None


def fetch_all_layouts(
    task_id: str,
    *,
    access_key_id: str,
    secret_access_key: str,
    endpoint: str,
    layout_step: int = _DEFAULT_LAYOUT_STEP,
) -> list[dict[str, Any]]:
    client, dm_models = _create_client(access_key_id, secret_access_key, endpoint)
    layouts: list[dict[str, Any]] = []
    layout_num = 0
    while True:
        request = dm_models.GetDocParserResultRequest(
            id=task_id,
            layout_num=layout_num,
            layout_step_size=layout_step,
        )
        try:
            response = client.get_doc_parser_result(request)
        except Exception as e:
            raise AliyunDocmindError(f"GetDocParserResult failed at {layout_num}: {e}") from e

        body = response.body
        if body is None or body.data is None:
            break
        chunk_items = _layout_items_from_result_data(body.data)
        if not chunk_items:
            break
        for item in chunk_items:
            if isinstance(item, dict):
                layouts.append(item)
            elif hasattr(item, "to_map"):
                layouts.append(item.to_map())
        if len(chunk_items) < layout_step:
            break
        layout_num += layout_step
    return layouts


def layouts_to_markdown(layouts: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for layout in layouts:
        md = (layout.get("markdownContent") or "").strip()
        if md:
            parts.append(md)
            continue
        text = (layout.get("text") or "").strip()
        if text:
            parts.append(text)
    return "\n".join(parts).strip()


def build_result_from_layouts(
    layouts: list[dict[str, Any]],
    *,
    file_hash: str,
    status_data: dict[str, Any] | None = None,
    markdown_override: str | None = None,
) -> dict[str, Any]:
    markdown = (markdown_override or "").strip() or layouts_to_markdown(layouts)
    page_count = 0
    if status_data:
        for key in ("PageCountEstimate", "page_count_estimate", "PageCount", "page_count"):
            val = status_data.get(key)
            if isinstance(val, int) and val > 0:
                page_count = val + (1 if key.lower().endswith("estimate") else 0)
                break
    if page_count <= 0 and layouts:
        pages = {layout.get("pageNum") for layout in layouts if layout.get("pageNum") is not None}
        page_count = len(pages) if pages else 1

    blocks: list[dict[str, Any]] = []
    layout_pages: dict[int, list[dict[str, Any]]] = {}
    for layout in layouts:
        text = (layout.get("text") or layout.get("markdownContent") or "").strip()
        if not text:
            continue
        page_num = int(layout.get("pageNum") or 0)
        block = {
            "label": layout.get("type") or layout.get("subType") or "text",
            "content": text,
            "bbox": [],
            "image_path": None,
        }
        blocks.append(block)
        layout_pages.setdefault(page_num, []).append(
            {
                "label": block["label"],
                "coordinate": [],
                "bbox": None,
                "content": text,
                "order": layout.get("index"),
                "polygon_points": [],
                "block_index": len(blocks) - 1,
            }
        )

    layout_det_res = [
        {
            "page_index": page_index,
            "boxes": boxes,
            "input_path": None,
            "input_img": None,
        }
        for page_index, boxes in sorted(layout_pages.items())
    ]

    return validate_parse_result(
        {
            "file_hash": file_hash,
            "parsing_res_list": blocks,
            "layout_det_res": layout_det_res,
            "markdown": markdown,
            "page_count": max(page_count, 1) if markdown else 0,
            "parser": "aliyun-docmind",
            "aliyun_layout_count": len(layouts),
        }
    )


def redact_file_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.query:
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}?…"
    return url
