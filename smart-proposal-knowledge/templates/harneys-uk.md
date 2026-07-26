---
type: Proposal Template
template_id: harneys-uk
title: Harneys UK — BVI & Cayman options letter
description: >-
  Unified UK-issued options letter for BVI and Cayman entity jurisdictions.
  Anchors harneys-uk-bvi-all-options and harneys-uk-cayman-all-options.
tags: [harneys, region:UK, Word, template]
status: draft
deliverable: word
catalog_filter:
  bu: harneys
  region: UK
entity_jurisdictions: [BVI, Cayman]
default_layout: custom
anchor_examples:
  - examples/harneys-uk-bvi-all-options.md
  - examples/harneys-uk-cayman-all-options.md
generated:
  by: human:qianping
  at: 2026-07-26T15:00:00Z
sources:
  - id: anchor-bvi
    resource: examples/harneys-uk-bvi-all-options.md
  - id: anchor-cayman
    resource: examples/harneys-uk-cayman-all-options.md
export:
  word:
    enabled: true
    shell: brand/ascentium-word-shell.md
sections:
  - id: introduction
    title: Cover letter
    kind: markdown_block
    required: true
    block: blocks/harneys/shared/introduction-letter.md

  - id: services_requested_bvi
    title: Services requested (BVI)
    kind: markdown_block
    required: false
    block: blocks/harneys/jurisdictions/bvi/services-requested.md

  - id: services_requested_cayman
    title: Services requested (Cayman)
    kind: markdown_block
    required: false
    block: blocks/harneys/jurisdictions/cayman/services-requested.md

  - id: about_ascentium
    title: About Ascentium
    kind: static_block
    required: true
    block: blocks/harneys/shared/about-ascentium.md

  - id: solution_and_fees
    title: Solution and pricing
    kind: fee_section
    required: true
    materializer: mdm_fee_tables
    layout: custom
    fee_layout:
      group_by: department
      table_style: simple
      currency: USD
      show_billing_frequency: true
      show_line_amount: true

  - id: adhoc_excluded_bvi
    title: Ad-hoc services (BVI)
    kind: static_block
    required: false
    block: blocks/harneys/jurisdictions/bvi/adhoc-excluded-services.md

  - id: approved_manager_bvi
    title: Approved Manager (BVI)
    kind: static_block
    required: false
    block: blocks/harneys/jurisdictions/bvi/approved-manager-regime.md

  - id: cayman_market
    title: Cayman market narrative
    kind: static_block
    required: false
    block: blocks/harneys/jurisdictions/cayman/market-narrative.md

  - id: service_capabilities
    title: Service capabilities
    kind: static_block
    required: true
    block: blocks/harneys/shared/service-capabilities.md

  - id: closing
    title: What we need / General
    kind: static_block
    required: true
    block: blocks/harneys/shared/closing-general.md
---

# Template: `harneys-uk`

Unified **Harneys UK-issued** options letter for **BVI** and **Cayman** entity jurisdictions. Custom fee layout (not catalog SKU layouts). Section spine in frontmatter `sections[]`.

## Shared vs jurisdiction-specific

| Section | BVI | Cayman |
|---------|-----|--------|
| Introduction, About, capabilities, closing | shared | shared |
| Services requested | `services_requested_bvi` | `services_requested_cayman` |
| Approved Manager regime | optional | — |
| Cayman market narrative | — | optional |
| Ad-hoc excluded list | BVI block | (fee rows differ — extend when second extract promoted) |

Fee tables (incorporation, annual maintenance, optional items, AEOI) materialize via `solution_and_fees` — amounts not stored in blocks.
