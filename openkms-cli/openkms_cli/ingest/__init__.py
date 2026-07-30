"""Document ingest routing — native formats vs cloud OCR."""

from openkms_cli.ingest.kinds import MARKDOWN_EXTENSIONS, IngestKind
from openkms_cli.ingest.registry import (
    input_suffix_from_ctx,
    is_native_ingest,
    native_ingest_extensions,
    resolve_ingest_kind,
    supported_batch_extensions,
)
from openkms_cli.ingest.runner import run_native_ingest

__all__ = [
    "IngestKind",
    "MARKDOWN_EXTENSIONS",
    "input_suffix_from_ctx",
    "is_native_ingest",
    "native_ingest_extensions",
    "resolve_ingest_kind",
    "run_native_ingest",
    "supported_batch_extensions",
]
