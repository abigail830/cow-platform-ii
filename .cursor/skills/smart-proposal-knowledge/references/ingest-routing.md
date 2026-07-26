# Ingest routing: source → OKF concept

## By filename pattern (flexon references)

| Pattern | `type` | Target path |
|---------|--------|-------------|
| `ascentium-*-brand-shell.docx` | `Output Shell` | `brand/ascentium-word-shell.md` |
| `ascentium-*-brand-shell.pptx` | `Output Shell` | `brand/ascentium-pptx-shell.md` |
| `*.anchors.json` (with shell) | (embedded in Output Shell body) | cite in shell concept `sources` |
| `incorp-{region}-*.docx` | `Reference Proposal` | `examples/incorp-{region}-{product}.md` |
| `incorp-{region}-*.pptx` | `Reference Proposal` | `examples/incorp-{region}-{product}.md` |
| `harneys-*.docx` | `Reference Proposal` | `examples/harneys-{market}-{product}.md` |
| `ux/*.png` | (aggregate) | `brand/ux-assets.md` |

## By content signal (after Layer 1 parse)

| Signal | `type` | Notes |
|--------|--------|-------|
| Fee table with known columns | Link to `layouts/{layout_id}.md` | Default by region in [layouts/index.md](../../smart-proposal-knowledge/layouts/index.md); override freely — `oneoff-recurring`, `multi-frequency`, `fee-billing` |
| "SERVICE SLAs" module | `Section Block` candidate | PH proposals |
| "Payment Option" blocks | `Section Block` candidate | AU proposals |
| KYC / required documents | `Document Block` or catalog trigger | Match `Category Catalog` rules |
| Decorative page / CONTACT US seal | `Output Shell` constraint | Not body content |

## Staging layout

```
smart-proposal-knowledge/references/
  inbox/           # drop new files here
  examples/        # canonical docx/pptx copies
  templates/       # brand shells
  extractions/{hash}/
    outline.json
    tables.json
    sections/*.md  # PII-redacted
```

## Commands (after staging)

1. `okf` skill — export/enrich from `extractions/{hash}/` or manual `add`
2. `okf` skill — `index` + validate `--strict`
3. Set `generated.by: process:office-ingest/v1` on machine-generated concepts
