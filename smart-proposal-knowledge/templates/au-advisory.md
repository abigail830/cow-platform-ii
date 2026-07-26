---
type: Proposal Template
template_id: au-advisory
title: Australia Advisory
description: Generic InCorp AU Word proposal — incorporation, advisory, multi-service. Anchor incorp-au-incorporation.
tags: [incorp, region:AU, jurisdiction:AU, Word, template]
status: draft
deliverable: word
catalog_filter:
  bu: incorp
  region: AU
  jurisdiction: AU
default_layout: multi-frequency
anchor_example: examples/incorp-au-incorporation.md
generated:
  by: human:qianping
  at: 2026-07-26T15:00:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-au-incorporation.md
    title: Reference Proposal — AU Incorporation
export:
  word:
    enabled: true
    shell: brand/ascentium-word-shell.md
document_title:
  prefix: INCORP ADVISORY PROPOSAL
  name_from: [client.company_name, client.contract_name]
  fallback: INCORP ADVISORY PROPOSAL
sections:
  - id: about_advisory
    title: About InCorp Advisory
    kind: static_block
    required: true
    block: blocks/incorp/regions/au/about-advisory.md

  - id: group_affiliation
    title: InCorp Group & International Affiliation
    kind: static_block
    required: true
    block: blocks/incorp/regions/au/group-affiliation.md

  - id: credentials_visual
    title: Credentials (visual)
    kind: visual_block
    required: true
    block: blocks/incorp/regions/au/credentials-visual.md

  - id: executive_summary
    title: Executive Summary
    kind: markdown_block
    required: true
    editable: true
    block: blocks/incorp/regions/au/executive-summary.md

  - id: solution_and_fees
    title: Solution and professional fees
    kind: fee_section
    required: true
    materializer: mdm_fee_tables
    layout: layouts/multi-frequency.md
    intro:
      block: blocks/incorp/regions/au/solution-pricing-intro.md
      editable: true
    fee_layout:
      group_by: package
      table_style: frequency_columns
      currency: AUD
      show_total_column: false
      total_column:
        computation: computations/fee-table-total-column.md
      show_line_amount: true
      service_columns:
        service_name: true
        description: false
        scope_of_work: true

  - id: fee_summary
    title: Fee summary
    kind: derived_section
    required: false
    default_enabled: true
    intro:
      block: blocks/incorp/regions/au/fee-summary-intro.md
    derivation:
      type: payment_options_from_fee_tables
      source_section: solution_and_fees
    payment_options:
      - id: option_a
        label: Payment Option A (Progressive billing)
      - id: option_b
        label: Payment Option B (Tax monthly retainer)

  - id: first_invoice
    title: Estimated first invoice value
    kind: derived_section
    required: false
    default_enabled: false
    block: blocks/incorp/shared/estimated-first-invoice-value.md
    derivation:
      type: first_invoice_from_fee_tables
      computation: computations/first-invoice-from-fee-tables.md
      source_section: solution_and_fees
      tax:
        rate: 0.10
        label: GST
        rate_display: 10%
      exclude:
        pattern: '(?i)(?<![a-z-])ad[\s-]?hoc(?![a-z])'
        fields: [preview_primary, scope_of_work_display, service_name, description, scope_of_work]
    agent_guidance: >
      Optional first-invoice rollup. Layout multi-frequency — map first selected
      frequency column to first_period_amount before computation (no AU anchor yet).

  - id: terms
    title: Terms and conditions
    kind: visual_block
    required: true
    block: blocks/incorp/regions/au/terms-appendix.md
---

# Template: `au-advisory`

Generic **InCorp AU Word** proposal. Layout `multi-frequency`. Compose contract: frontmatter `sections[]`.

**Not** for audit PPT — use `au-audit`.

## Composition

OKF §6.1 graph edges (one-way). Machine compose contract remains `sections[]`.

* [About InCorp Advisory](/blocks/incorp/regions/au/about-advisory.md)
* [InCorp Group & International Affiliation](/blocks/incorp/regions/au/group-affiliation.md)
* [Credentials (visual)](/blocks/incorp/regions/au/credentials-visual.md)
* [Executive Summary](/blocks/incorp/regions/au/executive-summary.md)
* [Solution and pricing intro](/blocks/incorp/regions/au/solution-pricing-intro.md)
* [Fee summary intro](/blocks/incorp/regions/au/fee-summary-intro.md)
* [Estimated first invoice value](/blocks/incorp/shared/estimated-first-invoice-value.md) (optional) — [computation](/computations/first-invoice-from-fee-tables.md)
* [Terms and conditions](/blocks/incorp/regions/au/terms-appendix.md)
* Fee layout: [multi-frequency](/layouts/multi-frequency.md)
* Export shell: [Ascentium Word shell](/brand/ascentium-word-shell.md)
* Anchor lineage (§5.1): [Incorporation (AU)](/examples/incorp-au-incorporation.md)
