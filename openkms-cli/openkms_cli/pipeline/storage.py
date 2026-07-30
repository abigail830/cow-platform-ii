"""S3/OSS helpers shared by pipeline run and async workers."""

import os
import re
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

console = Console(stderr=True)


def is_s3_uri(s: str) -> bool:
    return s.strip().lower().startswith("s3://")


def parse_s3_uri(uri: str) -> tuple[str, str]:
    m = re.match(r"^s3://([^/]+)/(.+)$", uri.strip())
    if not m:
        raise typer.BadParameter(f"Invalid S3 URI: {uri}. Use s3://bucket/key")
    return m.group(1), m.group(2).rstrip("/")


def _s3_addressing_style(endpoint_url: Optional[str]) -> str:
    force = os.environ.get("AWS_S3_FORCE_PATH_STYLE", "").strip().lower()
    if force in ("1", "true", "yes"):
        return "path"
    if endpoint_url:
        host = endpoint_url.lower()
        if "localhost" in host or "127.0.0.1" in host:
            return "path"
    return "virtual"


def get_s3_client(endpoint_url: Optional[str], access_key: str, secret_key: str, region: str):
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        console.print("[red]boto3 not installed. pip install openkms-cli[pipeline][/red]")
        raise typer.Exit(1)

    addressing_style = _s3_addressing_style(endpoint_url)
    kwargs = {
        "aws_access_key_id": access_key,
        "aws_secret_access_key": secret_key,
        "region_name": region,
        "config": Config(
            signature_version="s3v4",
            s3={"addressing_style": addressing_style},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    }
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    return boto3.client("s3", **kwargs)


def content_type_for_path(path: str) -> str:
    p = Path(path)
    suffixes = {
        ".md": "text/markdown",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }
    return suffixes.get(p.suffix.lower(), "application/octet-stream")
