# Smart Proposal OKF type vocabulary

Canonical spec: [SPEC.md](../../../../SPEC.md). Bundle copy: [meta/type-vocabulary.md](../../../../smart-proposal-knowledge/meta/type-vocabulary.md).

| `type` | Concept path pattern | Purpose |
|--------|---------------------|---------|
| `Proposal Template` | `templates/{id}.md` | Section spine, block refs, fee_layout, export |
| `Section Block` | `blocks/{bu}/regions/{region}/{name}.md` or `blocks/{bu}/jurisdictions/{code}/{name}.md` | Chapter prose + optional `selection` |
| `Quotation Layout` | `layouts/{layout_id}.md` | Fee table columns & formatting |
| `Layout Registry` | `layouts/index.md` | Layout list + region defaults |
| `Product Catalog` | `catalogs/products/{region}.md` | SKU seed data |
| `Package Catalog` | `catalogs/packages/{region}.md` | Bundle seed data |
| `Data Adapter` | `catalogs/adapters/*.md` | Live DB query contract |
| `Output Shell` | `brand/ascentium-{word\|pptx}-shell.md` | Brand shell |
| `Reference Proposal` | `examples/{name}.md` | Structure index — **no prose paste** |
| `Brand Guideline` | `brand/*.md` | Brand / UX rules |
| `Attested Computation` | `computations/*.md` | Fee / tax logic |
| `Playbook` | `playbooks/*.md` | Matching, compose workflows |

**Do not use:** `Category Catalog`, `Document Block`, `Credential Block`, `Team Bio Block` — all are `Section Block` with optional `selection`.

## Recommended frontmatter (routing)

| Concept | Field | Purpose |
|---------|-------|---------|
| `Reference Proposal` | `template_id` | Machine route to template when mapped (omit if unmapped) |
| `Proposal Template` | `template_id`, `anchor_example` | Contract id + structural fallback example |
| `Proposal Template` | `sections[].block`, `default_layout`, `export` | Compose graph — authoritative, not repeated in body |
| `Section Block` | `render`, `sources` | Body mode + extraction provenance |
| `Quotation Layout` | `layout_id` | Column shape id (not region-bound) |

## Section Block `render`

| Value | Meaning |
|-------|---------|
| `text` | Body from `references/extractions/.../text.txt` |
| `visual_pending` | Image-only in sample — spine documented, no synthesized copy |
| `visual_asset` | Binary in `references/ux/` via `resource` |

## Three concept layers (do not collapse)

| Layer | Type | Body content |
|-------|------|--------------|
| Sample index | `Reference Proposal` | Spine tables — no paragraph paste, no template links |
| Contract | `Proposal Template` | `sections[]` YAML; body = exceptions only |
| Prose | `Section Block` | Extracted + placeholderized text only |

Promotion: [example-to-block-pipeline.md](example-to-block-pipeline.md). Linking: [linking-policy.md](linking-policy.md).

## Region tags

`SG`, `AU`, `PH`, `MY`, `HK`, `VN`, `BVI`, `Cayman`, `InCorp`, `Harneys`, `Rikvin`.
