# Smart Proposal OKF type vocabulary

Canonical spec: [SPEC.md](../../../../SPEC.md). Only `type` is required per concept.

| `type` | Concept path pattern | Purpose |
|--------|---------------------|---------|
| `Proposal Template` | `templates/{id}.md` | Section spine, block refs, fee_layout, export |
| `Section Block` | `blocks/{scope}/{name}.md` | Chapter prose + optional `selection` / `compose_group` |
| `Quotation Layout` | `layouts/{layout_id}.md` | Fee table columns & formatting |
| `Layout Registry` | `layouts/index.md` | Layout list + region defaults |
| `Product Catalog` | `catalogs/products/{region}.md` | SKU seed data |
| `Package Catalog` | `catalogs/packages/{region}.md` | Bundle seed data |
| `Data Adapter` | `catalogs/adapters/*.md` | Live DB query contract |
| `Output Shell` | `brand/ascentium-{word\|pptx}-shell.md` | Brand shell |
| `Reference Proposal` | `examples/{name}.md` | Reference docx/pptx structure index |
| `Brand Guideline` | `brand/*.md` | Brand / UX rules |
| `Attested Computation` | `computations/*.md` | Fee / tax logic |
| `Playbook` | `playbooks/*.md` | Matching, compose workflows |

**Do not use:** `Category Catalog`, `Document Block`, `Credential Block`, `Team Bio Block` — all are `Section Block` with optional `selection`.

See bundle [meta/type-vocabulary.md](../../../../smart-proposal-knowledge/meta/type-vocabulary.md) for the full Section Block model.

## Region tags

`SG`, `AU`, `PH`, `MY`, `HK`, `VN`, `BVI`, `Cayman`, `InCorp`, `Harneys`, `Rikvin`.
