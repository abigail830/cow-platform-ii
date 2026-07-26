# Ingest routing: source → OKF concept

Linking after ingest: [linking-policy.md](linking-policy.md).

## By filename pattern

| Pattern | `type` | Target path |
|---------|--------|-------------|
| `ascentium-*-brand-shell.docx` | `Output Shell` | `brand/ascentium-word-shell.md` |
| `ascentium-*-brand-shell.pptx` | `Output Shell` | `brand/ascentium-pptx-shell.md` |
| `*.anchors.json` (with shell) | (embedded in Output Shell body) | cite in shell concept `sources` |
| `incorp-{region}-*.docx` | `Reference Proposal` | `examples/incorp-{region}-{product}.md` |
| `incorp-{region}-*.pptx` | `Reference Proposal` | `examples/incorp-{region}-{product}.md` |
| `harneys-*.docx` | `Reference Proposal` | `examples/harneys-{market}-{product}.md` |
| `ux/*.png` | (aggregate) | `brand/ux-assets.md` + `references/ux/` |

## Layer 1 staging (required before blocks)

```
smart-proposal-knowledge/references/
  inbox/              # drop new files
  examples/           # canonical docx/pptx
  templates/          # brand shell binaries + anchors.json
  extractions/{slug}/
    manifest.json
    outline.json      # headings, image count
    text.txt          # paragraph extract — block body source
    tables.json       # fee tables
    spine.md          # PII-redacted structural index
```

`{slug}` aligns with example id (e.g. `incorp-sg-cs-ep-accounting-payroll-tax`).

## Layer 2 routing

| Step | Output | `type` | Source |
|------|--------|--------|--------|
| 2a Index | `examples/{name}.md` | `Reference Proposal` | `spine.md` + `outline.json`; add `template_id` + row in `examples/index.md` when mapped |
| 2b Contract | `templates/{template_id}.md` | `Proposal Template` | `anchor_example` + `sections[]` from anchor spine; legacy yaml for section IDs only |
| 2c Blocks | `blocks/{bu}/regions/{region}/{name}.md` | `Section Block` | **`text.txt` only** — see [example-to-block-pipeline.md](example-to-block-pipeline.md) |

## By content signal (after Layer 1)

| Signal | Action |
|--------|--------|
| Fee table columns match known layout | Record `layout_id` as plain text in example spine (e.g. `` `oneoff-recurring` ``) — not a markdown link to `layouts/` |
| Heading in outline, empty in `text.txt` | `Section Block` with `render: visual_pending` |
| Paragraph in `text.txt` | `Section Block` with `render: text` after PII pass |
| "SERVICE SLAs" module | Block candidate — PH |
| "Payment Option" blocks | Block candidate — AU |
| Immigration / EP disclaimer | Conditional block — `selection` + append after fee module |
| Decorative page / CONTACT US seal | `Output Shell` constraint on template `export` — not block body |

## Commands

1. Layer 1 — `docx` skill or officecli → `extractions/{slug}/`
2. Layer 2a — write `examples/{name}.md` + update `examples/index.md` if new mapping
3. Layer 2b/2c — follow [example-to-block-pipeline.md](example-to-block-pipeline.md)
4. `okf` validate `--strict` when available
5. `generated.by`: `process:office-ingest/v1` (Reference Proposal) or `process:office-extract/v1` (Section Block from text.txt)

## Do not route to Section Block body

| Source | Why |
|--------|-----|
| `proposal-composer/.../blocks/*.md` | Different wording from reference samples; not provenance |
| `template.yaml` intro files | Composer contract, not sample extract |
| Paths outside `smart-proposal-knowledge/` | Bundle must be self-contained |

## Do not add after ingest

| Anti-pattern | Why |
|--------------|-----|
| Example → template markdown links in concept bodies | `template_id` frontmatter + `examples/index.md` |
| Anchor column back in `templates/index.md` | Duplicates examples index |
| Example lists in `layouts/*.md` body | Layout `sources` → binary is enough |
