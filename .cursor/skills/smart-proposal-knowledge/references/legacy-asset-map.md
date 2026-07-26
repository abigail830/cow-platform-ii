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
| `knowledge/templates/*/template.yaml` | `templates/{template_id}.md` — **section IDs only**; prose from example `text.txt` |
| `knowledge/templates/*/blocks/*.md` | **Do not copy verbatim** — use as dedup hint only; promote from [example extractions](../../../../smart-proposal-knowledge/references/extractions/) |
| `knowledge/peripheral/required-docs/**/*.md` | `blocks/{scope}/*.md` (`Section Block` + `selection`) |
| `skills/proposal-composer/references/required-docs-*-catalog.md` | `selection` on each block; compose in template |
| `skills/proposal-composer/references/required-docs-compose.md` | `playbooks/required-docs-compose.md` |

## Region coverage (migration priority)

See [examples/index.md](../../../../smart-proposal-knowledge/examples/index.md) for reference samples and `template_id` mapping. [region-routing.md](../../../../smart-proposal-knowledge/meta/region-routing.md) for default layout + template per BU/region.

| Region | Default layout | Catalog seeds | Samples |
|--------|----------------|---------------|---------|
| MY | fee-billing | yes | — |
| SG | oneoff-recurring | yes + live | examples index |
| PH | multi-frequency | yes | examples index |
| AU | multi-frequency | placeholder | examples index |
| HK, VN | TBD | missing | examples index |
| BVI, Cayman | custom (Harneys) | MDM PG | examples index |
