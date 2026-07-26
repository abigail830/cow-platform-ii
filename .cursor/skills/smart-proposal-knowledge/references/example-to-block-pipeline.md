# Example → Section Block pipeline

Canonical workflow for promoting reference samples into **Section Block** concepts and wiring them into **Proposal Template** contracts.

Linking rules: [linking-policy.md](linking-policy.md) — read first.

## Pipeline stages

```text
docx/pptx in references/examples/
        │
        ▼  Layer 1 (docx skill / officecli)
references/extractions/{slug}/
  ├── outline.json    # headings, image count
  ├── text.txt        # paragraph text (may be sparse)
  ├── tables.json     # fee table shape
  └── spine.md        # human PII-redacted index
        │
        ▼  Layer 2a — structure only
examples/{name}.md          type: Reference Proposal
  template_id: {id}         # when mapped — see examples/index.md
        │
        ▼  Layer 2b — contract (when anchor mapped)
templates/{template_id}.md  type: Proposal Template
  anchor_example: examples/{name}.md
  sections[].block          # wiring — no duplicate spine table in body
        │
        ▼  Layer 2c — prose blocks (manual/semi-auto)
blocks/{bu}/regions/{region}/*.md   type: Section Block
```

**Order matters:** Reference Proposal first → resolve `template_id` from [examples/index.md](../../../../smart-proposal-knowledge/examples/index.md) → promote blocks **only from that anchor example's extraction** (`anchor_example` on the template).

## Single source of truth for block bodies

| Allowed `sources` | Forbidden |
|-------------------|-----------|
| `references/extractions/{slug}/text.txt` | `proposal-composer/.../blocks/*.md` |
| `references/extractions/{slug}/spine.md` | `template.yaml` prose |
| `references/extractions/{slug}/outline.json` | `file://` paths outside the bundle |
| Anchor `examples/{name}.md` (structure index only) | Paraphrasing / “marketing copy” not in extraction |
| Future: `references/ux/*.png` for visual blocks | OCR guesswork without staging asset |
| Template / Output Shell in block body | Use template `export` + `sections[]` instead |

If the text is not in `text.txt`, **do not invent it**.

## `render` modes (Section Block frontmatter)

| `render` | When | Block body |
|----------|------|------------|
| `text` | Paragraphs present in `text.txt` | Verbatim extract → placeholderize PII → markdown |
| `visual_pending` | H1 in spine/outline but no body in `text.txt` (images) | Spine table only — **no synthesized prose** |
| `visual_asset` *(future)* | UX asset registered | `resource: references/ux/...` + optional alt text |

Set `generated.by: process:office-extract/v1` when body comes from Layer 1 extraction.

### Detecting visual-only sections

1. Read `outline.json` → note H1 headings and `images` count.
2. Read `text.txt` → if heading appears but following lines are empty until next heading, section is **visual**.
3. Create one `visual_pending` block per credentials run **or** one block listing multiple image sections (see `credentials-visual.md` pilot).
4. Do **not** transcribe content from legacy composer or brand PDFs to “fill in” the gap.
5. Do **not** link Output Shell concepts from block bodies — document shell zones in template `export` only.

## PII placeholderization (text blocks)

Replace before writing block body — see [pii-and-extract-rules.md](pii-and-extract-rules.md).

| In sample | Placeholder |
|-----------|-------------|
| Client / company name | `{{client.company_name}}` |
| Contact / addressee | `{{client.contact_name}}` |
| Proposal date | `{{proposal_date}}` |
| Our signatory | `{{our_contact.name}}`, `{{our_contact.title}}` |
| Enumerated service list in scope | `{{selected_packages_summary}}` (derived at compose time) |
| Fee amounts | never in blocks — fee tables are materialized separately |

Record provenance in `sources`:

```yaml
sources:
  - id: extraction-text
    resource: references/extractions/incorp-sg-cs-ep-accounting-payroll-tax/text.txt
    title: Layer 1 text extraction (lines 85)
```

## Proposal Template wiring

After blocks exist under `blocks/`:

1. Add/update `templates/{template_id}.md` with `sections[].block` → bundle-relative path only.
2. Set `anchor_example: examples/{anchor}.md` in frontmatter — **do not** add a spine ↔ section table in the template body.
3. `kind: visual_block` for `render: visual_pending`; `markdown_block` / `static_block` for `render: text`.
4. Conditional append blocks (e.g. Rikvin disclaimer) → `optional_blocks` + `selection` on the block.
5. Template body: **exceptions only** (wrong template, subset behavior, jurisdiction notes) — see [linking-policy.md](linking-policy.md).

Do not mark template/block work **done** until every section either links to a real block or is explicitly `visual_pending` / shell zone.

## Per-example checklist

Before setting `status: draft` on new Section Blocks:

- [ ] Body lines traceable to `text.txt` line numbers **or** block is `visual_pending` with spine citation
- [ ] No client names, dates, emails, fee figures in body
- [ ] No paths outside `smart-proposal-knowledge/`
- [ ] `blocks/index.md` updated under the correct **path tree** (not grouped by template)
- [ ] `templates/{id}.md` `sections[]` references match created files
- [ ] Reference Proposal has `template_id` when mapped; body unchanged (structure index only — no pasted prose, no template links)
- [ ] No bidirectional example↔template markdown links added

## Anchor vs special examples

| Role | Block promotion |
|------|-----------------|
| **Anchor** (generic template) | Full template spine → blocks for all text sections |
| **Special** (audit PPT, rates schedule) | Separate `template_id`; promote only that sample's spine |
| **Subset** (e.g. Rikvin EP-only) | Reuse parent template blocks; do not fork unless spine diverges |

Authoritative example ↔ `template_id` map: [examples/index.md](../../../../smart-proposal-knowledge/examples/index.md). Template catalog (no anchor column): [templates/index.md](../../../../smart-proposal-knowledge/templates/index.md).

## Completed templates (2026-07-26)

| `template_id` | Anchor example (concept id) | Extraction slug |
|---------------|----------------------------|-----------------|
| `sg-incorp` | `examples/incorp-sg-cs-ep-accounting-payroll-tax` | `incorp-sg-cs-ep-accounting-payroll-tax` |
| `au-advisory` | `examples/incorp-au-incorporation` | `incorp-au-incorporation` |
| `ph-cs` | `examples/incorp-ph-cs` | `incorp-ph-cs` |
| `vn-services` | `examples/incorp-vn-cs-tax-payroll-tax-hr` | `incorp-vn-cs-tax-payroll-tax-hr` |
| `ph-recruitment` | `examples/incorp-ph-recruitment` | `incorp-ph-recruitment` |
| `harneys-uk` | `examples/harneys-uk-bvi-all-options`, `examples/harneys-uk-cayman-all-options` | same slugs |
| `harneys-hk` | `examples/harneys-hk-incorporation` | `harneys-hk-incorporation` |

## Next (same pipeline)

| `template_id` | Anchor example | Extraction slug |
|---------------|----------------|-----------------|
| `sg-audit` | `examples/incorp-sg-internal-audit` | `incorp-sg-internal-audit` |
| `au-audit` | `examples/incorp-au-audit` | `incorp-au-audit` |

Repeat: **extraction → placeholderize → block → template wire**. Never skip extraction.
