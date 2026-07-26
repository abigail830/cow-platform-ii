---
type: Reference
title: Smart Proposal type vocabulary
description: OKF concept types and path patterns for the smart-proposal-knowledge bundle. Section prose uses a single Section Block type with optional inclusion rules.
tags: [meta, vocabulary, smart-proposal-knowledge]
status: stable
generated:
  by: human:qianping
  at: 2026-07-26T12:10:00Z
sources:
  - id: repo-spec
    resource: /SPEC.md
    title: OKF v0.2 specification (repo root)
---

# Type vocabulary

Canonical spec: [SPEC.md](../../SPEC.md). Only `type` is required per concept.

| `type` | Concept path pattern | Purpose |
|--------|---------------------|---------|
| `Proposal Template` | `templates/{id}.md` | Section spine, block references, fee_layout, export config |
| `Section Block` | `blocks/{bu}/regions/{region}/{name}.md` or `blocks/{bu}/jurisdictions/{jurisdiction}/{name}.md` | Reusable chapter prose **with optional inclusion rules** |
| `Quotation Layout` | `layouts/{layout_id}.md` | Fee table columns and formatting |
| `Layout Registry` | `layouts/index.md` | Layout list and region defaults |
| `Product Catalog` | `catalogs/products/{region}.md` | SKU seed data |
| `Package Catalog` | `catalogs/packages/{region}.md` | Bundle seed data |
| `Data Adapter` | `catalogs/adapters/*.md` | Live DB query contract (MySQL / PG MDM) |
| `Output Shell` | `brand/ascentium-{word,pptx}-shell.md` | Brand master — anchors, placeholders, sealed zones |
| `Reference Proposal` | `examples/{name}.md` | Structure index from sample docx/pptx (no PII) |
| `Brand Guideline` | `brand/*.md` | Colors, fonts, UX constraints |
| `Attested Computation` | `computations/*.md` | Verifiable fee or tax logic |
| `Playbook` | `playbooks/*.md` | Matching, compose, assembly rules |
| `Reference` | `meta/*.md` | Bundle meta documentation |

## Section Block model (unified)

All proposal prose sections are **`Section Block`**. There is no separate `Category Catalog` or `Document Block`.

Difference between "fixed" and "conditional" sections is **not** a different `type` — it is whether the block carries **inclusion rules**.

### Always-on vs conditional

| Pattern | How it is expressed |
|---------|---------------------|
| **Fixed section** (e.g. Introduction) | Template references block; block has no `selection` (or `selection.mode: always`) |
| **Conditional section** (e.g. Individual KYC) | Same `Section Block`; frontmatter `selection` defines when to include |
| **Composed chapter** (e.g. Required documents) | Template defines a `compose_group`; multiple blocks with matching `compose_group` are merged when each passes its `selection` |

### Recommended `selection` frontmatter (optional)

```yaml
selection:
  mode: conditional          # always | conditional | append_when_any
  include_when: "..."        # natural language or structured trigger (fee rows, packages, region)
  exclude_when: "..."
  append_when_any: [block_id, ...]   # for closing / footer blocks
  requires_structure: false  # if true, need client structure facts before compose
  trigger_source: solution_and_fees    # which proposal section feeds triggers
  order: 10
compose_group: harneys-required-docs   # blocks merged under same template chapter
post_process: "..."          # agent-only notes (e.g. prune Reserve Director item)
```

Rules in `selection` are **agent-facing**; the block body is **client-facing** prose only.

### Proposal Template references blocks

Template body (or frontmatter) lists the spine — no separate catalog file:

```yaml
sections:
  - id: introduction
    block: /blocks/harneys/introduction-bvi.md
    required: true

  - id: required_documents
    title: Required documents
    compose_group: harneys-required-docs
    trigger_source: solution_and_fees
```

Consumer resolves: load all `Section Block` concepts with `compose_group: harneys-required-docs`, evaluate each `selection`, sort by `order`, apply `post_process`, concatenate.

### Block paths vs Reference Proposals

| Source | Target | Auto on ingest? |
|--------|--------|-----------------|
| [Reference Proposal](/examples/index.md) | Spine, fee pattern, block **candidates** | Yes |
| Sample paragraph text | [Section Block](/blocks/index.md) body | **No** — promote after dedup, placeholderize, human `verified` |

Path pattern: `blocks/{bu}/regions/{region}/` or `blocks/{bu}/jurisdictions/{jurisdiction}/` — see [bu-region-jurisdiction.md](/meta/bu-region-jurisdiction.md).

### Section Block `render`

| Value | Body source |
|-------|-------------|
| `text` | `references/extractions/{slug}/text.txt` — placeholderize PII |
| `visual_pending` | Image-only in sample — spine in body, no synthesized prose |
| `visual_asset` | `resource: references/ux/...` when registered |

Promotion workflow: extract from `references/extractions/{slug}/text.txt` per bundle conventions. Pilot path: `blocks/incorp/regions/sg/`.

## Legacy mapping

| agent-platform | OKF (unified) |
|----------------|---------------|
| `blocks/introduction-bvi.md` | `Section Block` — no `selection` |
| `knowledge.category: harneys` + catalog + `peripheral/required-docs/harneys/*.md` | Multiple `Section Block` under `blocks/harneys/` each with `selection` + shared `compose_group` |
| `required-docs-harneys-catalog.md` | **Dissolved** — rules move onto each block's `selection`; compose list lives in Proposal Template `harneys-uk` |

## Removed types (do not use)

| Former type | Replaced by |
|-------------|-------------|
| `Category Catalog` | `selection` on `Section Block` + `compose_group` on template |
| `Document Block` | `Section Block` |
| `Credential Block` | `Section Block` under `blocks/{bu}/` |
| `Team Bio Block` | `Section Block` under `blocks/audit/` or region folder |

## Recommended frontmatter (v0.2)

Beyond `type`, set when known: `title`, `description`, `tags`, `resource`, `sources`, `status`, `generated`, `verified`, `stale_after`.

### Routing fields (do not duplicate in markdown links)

| Concept | Field | Authoritative catalog |
|---------|-------|----------------------|
| `Reference Proposal` | `template_id` | [examples/index.md](/examples/index.md) |
| `Reference Proposal` | `reference_role`, `locale`, `content_mode` | [locale-references.md](/meta/locale-references.md) |
| `Proposal Template` | `template_id`, `anchor_example`, `sections[]` | [templates/index.md](/templates/index.md) |

Each relationship is declared once — see project skill `linking-policy.md` under `.cursor/skills/smart-proposal-knowledge/references/`.

## Region tags

`SG`, `AU`, `PH`, `MY`, `HK`, `VN`, `BVI`, `Cayman`, `InCorp`, `Harneys`, `Rikvin`.
