"""Build PageIndex-compatible tree structure from markdown (backward-compatible shim)."""

from .page_index_markdown import build_page_index_from_markdown, md_to_tree

__all__ = ["build_page_index_from_markdown", "md_to_tree"]
