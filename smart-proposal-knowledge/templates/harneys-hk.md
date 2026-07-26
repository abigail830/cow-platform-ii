---
type: Proposal Template
template_id: harneys-hk
title: Harneys HK — Formation & administration rates
description: Bilingual rates schedule for HK company formation. Anchor harneys-hk-incorporation.
tags: [harneys, region:HK, jurisdiction:HK, Word, template, bilingual]
status: draft
deliverable: word
catalog_filter:
  bu: harneys
  region: HK
  jurisdiction: HK
default_layout: custom
anchor_example: examples/harneys-hk-incorporation.md
generated:
  by: human:qianping
  at: 2026-07-26T15:00:00Z
sources:
  - id: anchor-example
    resource: examples/harneys-hk-incorporation.md
export:
  word:
    enabled: true
    shell: brand/ascentium-word-shell.md
sections:
  - id: rates_header
    title: Rates schedule title
    kind: markdown_block
    required: true
    block: blocks/harneys/regions/hk/rates-schedule-header.md

  - id: rates_table
    title: Master rates table
    kind: fee_section
    required: true
    materializer: mdm_fee_tables
    layout: custom
    visual_spine:
      block: blocks/harneys/regions/hk/rates-schedule-table.md

  - id: rates_footnotes
    title: Footnotes
    kind: static_block
    required: true
    block: blocks/harneys/regions/hk/rates-footnotes.md
---

# Template: `harneys-hk`

**Harneys HK** bilingual administration rates schedule — not the UK options-letter pattern (`harneys-uk`). Compose contract: frontmatter `sections[]`.

## Composition

OKF §6.1 graph edges (one-way). Machine compose contract remains `sections[]`.

* [Rates schedule title](/blocks/harneys/regions/hk/rates-schedule-header.md)
* [Master rates table](/blocks/harneys/regions/hk/rates-schedule-table.md)
* [Footnotes](/blocks/harneys/regions/hk/rates-footnotes.md)
* Export shell: [Ascentium Word shell](/brand/ascentium-word-shell.md)
* Anchor lineage (§5.1): [HK Incorporation Rates](/examples/harneys-hk-incorporation.md)
