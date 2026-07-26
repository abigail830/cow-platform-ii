"""Minimal OKF bundle reader for proposal compose agents."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

RESERVED = {"index.md", "log.md"}
LINK = re.compile(r"(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")


def split_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    lines = text.splitlines(keepends=True)
    if lines[0].strip() != "---":
        return {}, text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            try:
                meta = yaml.safe_load("".join(lines[1:i])) or {}
            except yaml.YAMLError:
                meta = {}
            return (meta if isinstance(meta, dict) else {}), "".join(lines[i + 1 :])
    return {}, text


class OKFBundle:
    def __init__(self, root: Path | str):
        self.root = Path(root).resolve()
        if not (self.root / "index.md").is_file():
            raise FileNotFoundError(f"Not an OKF bundle (missing index.md): {self.root}")

    def _resolve(self, rel: str) -> Path:
        rel = rel.strip().lstrip("/")
        if rel.endswith(".md"):
            path = (self.root / rel).resolve()
        else:
            path = (self.root / f"{rel}.md").resolve()
        if not str(path).startswith(str(self.root)):
            raise ValueError(f"Path escapes bundle root: {rel}")
        return path

    def read_concept(self, rel: str, *, max_chars: int = 24_000) -> dict:
        path = self._resolve(rel)
        if not path.is_file():
            raise FileNotFoundError(rel)
        text = path.read_text(encoding="utf-8")
        meta, body = split_frontmatter(text)
        if len(text) > max_chars:
            text = text[:max_chars] + "\n\n…(truncated)"
            _, body = split_frontmatter(text)
        concept_id = str(path.relative_to(self.root)).removesuffix(".md")
        return {
            "id": concept_id,
            "path": str(path.relative_to(self.root)),
            "type": meta.get("type"),
            "title": meta.get("title"),
            "frontmatter": meta,
            "body": body.strip(),
        }

    def list_concepts(self, *, prefix: str = "", limit: int = 80) -> list[dict]:
        root = self.root / prefix if prefix else self.root
        out: list[dict] = []
        for path in sorted(root.rglob("*.md")):
            if path.name in RESERVED or path.name == "index.md":
                continue
            rel = path.relative_to(self.root)
            if any(p.startswith(".") for p in rel.parts):
                continue
            meta, _ = split_frontmatter(path.read_text(encoding="utf-8"))
            out.append(
                {
                    "id": str(rel).removesuffix(".md"),
                    "type": meta.get("type"),
                    "title": meta.get("title"),
                    "description": (meta.get("description") or "")[:160],
                }
            )
            if len(out) >= limit:
                break
        return out

    def search(self, query: str, *, limit: int = 12) -> list[dict]:
        q = query.lower()
        hits: list[tuple[int, dict]] = []
        for path in self.root.rglob("*.md"):
            if path.name in RESERVED:
                continue
            text = path.read_text(encoding="utf-8").lower()
            if q not in text:
                continue
            meta, _ = split_frontmatter(path.read_text(encoding="utf-8"))
            score = text.count(q)
            hits.append(
                (
                    score,
                    {
                        "id": str(path.relative_to(self.root)).removesuffix(".md"),
                        "type": meta.get("type"),
                        "title": meta.get("title"),
                    },
                )
            )
        hits.sort(key=lambda x: -x[0])
        return [h[1] for h in hits[:limit]]

    def template_sections(self, template_id: str) -> dict:
        data = self.read_concept(f"templates/{template_id}")
        sections = data["frontmatter"].get("sections") or []
        return {
            "template_id": data["frontmatter"].get("template_id", template_id),
            "title": data["title"],
            "anchor_example": data["frontmatter"].get("anchor_example"),
            "default_layout": data["frontmatter"].get("default_layout"),
            "sections": [
                {
                    "id": s.get("id"),
                    "title": s.get("title"),
                    "kind": s.get("kind"),
                    "required": s.get("required"),
                    "default_enabled": s.get("default_enabled"),
                    "block": s.get("block"),
                }
                for s in sections
                if isinstance(s, dict)
            ],
        }
