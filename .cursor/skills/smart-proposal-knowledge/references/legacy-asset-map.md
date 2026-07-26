# Legacy asset → OKF concept map

## axon-flow (x-flexon + x-proposal)

Base: `/Users/qianping/Documents/Source/ascentium/axon-flow/backend/agent_platform/agents/`

| Legacy path | OKF target |
|-------------|------------|
| `x-flexon/assets/templates/ascentium-*-brand-shell.*` | `brand/ascentium-*-shell.md` + `references/templates/` |
| `x-flexon/assets/references/*.{docx,pptx}` | `examples/*.md` + `references/examples/` |
| `x-flexon/assets/ux/*` | `brand/ux-assets.md` + `references/ux/` |
| `x-flexon/skills/brand-theme/references/brand-guide.md` | `brand/ascentium-guidelines.md` |
| `x-flexon/skills/proposal-writing/references/*.md` | `brand/` or `playbooks/` |
| `x-proposal/skills/sp-proposal-builder/references/quotation-layout-*.md` | `layouts/*.md` |
| `x-proposal/skills/sp-proposal-builder/references/quotation-layout-registry.md` | `layouts/index.md` |
| `x-proposal/skills/sp-proposal-builder/references/proposal-state-flexible.md` | `meta/proposal-state-schema.md` (if needed) |
| `x-proposal/skills/sp-proposal-builder/references/matching-and-recommendation.md` | `playbooks/catalog-matching.md` |
| `x-proposal/skills/product-catalog-explorer/references/*-products.md` | `catalogs/products/{region}.md` |
| `x-proposal/skills/package-catalog-explorer/references/*-packages.md` | `catalogs/packages/{region}.md` |
| `x-proposal/skills/*/references/db-*-query.md` | `catalogs/adapters/*.md` |

## agent-platform (proposal-composer)

Base: `/Users/qianping/Documents/Source/ascentium/agent-platform/backend/agents/proposal-composer/`

| Legacy path | OKF target |
|-------------|------------|
| `knowledge/templates/*/template.yaml` | `templates/{template_id}.md` |
| `knowledge/templates/*/blocks/*.md` | `blocks/{template_id}/*.md` |
| `knowledge/peripheral/required-docs/**/*.md` | `blocks/{scope}/*.md` (`Section Block` + `selection`) |
| `skills/proposal-composer/references/required-docs-*-catalog.md` | `selection` on each block; compose in template |
| `skills/proposal-composer/references/required-docs-compose.md` | `playbooks/required-docs-compose.md` |

## Region coverage (migration priority)

| Region | Default layout | Catalog seeds | Reference samples |
|--------|----------------|---------------|-------------------|
| MY | fee-billing | yes | — |
| SG | oneoff-recurring | yes + live | 4 files |
| PH | multi-frequency | yes | 2 docx |
| AU | multi-frequency | placeholder | 2 files |
| HK, VN | TBD | missing | samples only |
| BVI, Cayman | fee-billing (or custom matrix) | MDM PG | harneys docx |
