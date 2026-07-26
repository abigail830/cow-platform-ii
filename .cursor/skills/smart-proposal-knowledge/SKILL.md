---
name: smart-proposal-knowledge
description: >-
  Smart Proposal OKF bundle domain rules for Ascentium multi-region proposals.
  Use when building or enriching the smart-proposal-knowledge bundle, importing
  Word/PPT reference proposals or brand shells, promoting Section Blocks from
  example extractions, wiring Proposal Templates, or applying PII redaction.
  Pair with okf and docx skills — domain vocabulary only.
---

# Smart Proposal Knowledge

Domain layer for the `smart-proposal-knowledge/` OKF bundle in this repo. Spec: [SPEC.md](../../../SPEC.md) (OKF v0.2).

## Companion skills

| Task | Skill |
|------|-------|
| OKF init / add / export / enrich / validate | `okf` (`~/.agents/skills/okf`) |
| Word structure & tables (Layer 1) | `docx` (`~/.agents/skills/docx`) |

## When to load references

| Reference | Use when |
|-----------|----------|
| [linking-policy.md](references/linking-policy.md) | **Creating/editing any concept** — avoid duplicate edges |
| [example-to-block-pipeline.md](references/example-to-block-pipeline.md) | **Promoting blocks or templates from reference examples** |
| [pii-and-extract-rules.md](references/pii-and-extract-rules.md) | Layer 1 staging, PII, text vs visual sections |
| [ingest-routing.md](references/ingest-routing.md) | Routing inbox files → concept type |
| [type-vocabulary.md](references/type-vocabulary.md) | Choosing `type`, tags, or concept paths |
| [legacy-asset-map.md](references/legacy-asset-map.md) | High-level migration map only — **not** block body source |

## Knowledge pipeline (three layers)

1. **Layer 1 — Extract** — `docx` / officecli → `references/extractions/{slug}/` (`outline.json`, `text.txt`, `tables.json`, `spine.md`). PII-redact staging.
2. **Layer 2a — Index** — `examples/{name}.md` (`Reference Proposal`): spine, fee pattern, block **candidates** — **no prose paste**. Set `template_id` when mapped; catalog in `examples/index.md` only.
3. **Layer 2b — Contract** — `templates/{template_id}.md` (`Proposal Template`): `sections[]`, layout, export shell — `anchor_example` in frontmatter only (no spine table in body).
4. **Layer 2c — Blocks** — `blocks/{bu}/regions/{region}/*.md` (`Section Block`): body **only** from Layer 1 `text.txt` (or `visual_pending` if image-only). Wire via template `sections[].block`.

Load [linking-policy.md](references/linking-policy.md) before editing indexes or concept cross-references. Load [example-to-block-pipeline.md](references/example-to-block-pipeline.md) before creating Section Blocks.

## Bundle boundary

- All concept `sources` and `resource` paths MUST stay inside `smart-proposal-knowledge/`.
- Never cite `proposal-composer`, `axon-flow`, or other repos as block body provenance.
- Legacy YAML/markdown informs **template section IDs** only after anchor example confirms the same spine.

## Do not

- Copy client names, dates, fee figures, or PII into concept bodies.
- Promote Section Block prose from legacy composer `blocks/*.md` — use example `text.txt` only.
- Synthesize marketing copy for image-only credentials pages — use `render: visual_pending`.
- Treat brand shells as reference proposals (different `type` and extract path).
- Mark block/template work complete without line-level extraction provenance.
- Re-implement OKF validation — use the `okf` skill's validator.
- Duplicate relationships in markdown links when frontmatter or an index already declares them — see [linking-policy.md](references/linking-policy.md).
