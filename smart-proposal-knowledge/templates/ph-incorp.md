---
type: Proposal Template
template_id: ph-incorp
title: Philippines Incorp
description: >-
  InCorp PH Word proposal — incorporation, payroll, bookkeeping/tax, immigration,
  SERVICE SLAs, and extended legal terms. Anchor incorp-ph-cs-payroll-bookkeeping-ep.
tags: [incorp, region:PH, jurisdiction:PH, Word, template]
status: draft
deliverable: word
catalog_filter:
  bu: incorp
  region: PH
  jurisdiction: PH
default_layout: multi-frequency
anchor_example: examples/incorp-ph-cs-payroll-bookkeeping-ep.md
generated:
  by: human:qianping
  at: 2026-07-26T23:45:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-ph-cs-payroll-bookkeeping-ep.md
    title: Reference Proposal — PH CS / Payroll / Bookkeeping / EP
export:
  word:
    enabled: true
    shell: brand/ascentium-word-shell.md
sections:
  - id: about_incorp
    title: About InCorp
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/about-incorp.md

  - id: credentials_visual
    title: Credentials (visual)
    kind: visual_block
    required: true
    block: blocks/incorp/regions/ph/credentials-visual.md

  - id: executive_summary
    title: Fee Proposal
    kind: markdown_block
    required: true
    block: blocks/incorp/regions/ph/executive-summary.md

  - id: solution_and_fees
    title: Services and fees
    kind: fee_section
    required: true
    materializer: mdm_fee_tables
    layout: layouts/multi-frequency.md
    intro:
      block: blocks/incorp/regions/ph/solution-pricing-intro.md
    fee_layout:
      group_by: module
      table_style: frequency_columns_with_total
      currency: PHP
      show_total_column: true
      total_column:
        computation: computations/fee-table-total-column.md
      service_columns:
        service_name: true
        description: true
        scope_of_work: true

  - id: service_slas
    title: Service SLAs
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/service-slas.md

  - id: cs_scope
    title: Corporate secretarial scope
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/cs-scope.md

  - id: cs_exclusions
    title: Exclusions
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/cs-exclusions.md

  - id: cs_terms
    title: CS terms
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/cs-service-terms.md

  - id: indemnity
    title: Indemnity
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/indemnity.md

  - id: corporate_treasurer
    title: Corporate Treasurer Service
    kind: static_block
    required: false
    default_enabled: false
    block: blocks/incorp/regions/ph/corporate-treasurer-service.md

  - id: nominee_director
    title: Nominee Director Service
    kind: static_block
    required: false
    default_enabled: false
    block: blocks/incorp/regions/ph/nominee-director-service.md

  - id: bookkeeping_terms
    title: Bookkeeping and tax compliance terms
    kind: static_block
    required: false
    default_enabled: false
    block: blocks/incorp/regions/ph/bookkeeping-tax-terms.md

  - id: payroll_services
    title: Payroll services
    kind: static_block
    required: false
    default_enabled: false
    block: blocks/incorp/regions/ph/payroll-services.md

  - id: immigration_scope
    title: Immigration scope
    kind: static_block
    required: false
    default_enabled: false
    block: blocks/incorp/regions/ph/immigration-scope.md

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
        rate: 0.12
        label: VAT
        rate_display: 12%
      exclude:
        pattern: '(?i)(?<![a-z-])ad[\s-]?hoc(?![a-z])'
        fields: [preview_primary, scope_of_work_display, service_name, description, scope_of_work]
    agent_guidance: >
      Optional first-invoice rollup. Map first billing period from multi-frequency
      columns before calling first-invoice computation.

  - id: unified_terms
    title: Unified terms and conditions
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/unified-terms.md
---

# Template: `ph-incorp`

InCorp **Philippines** multi-service Word proposal — incorporation, payroll, bookkeeping/tax, immigration. Layout `multi-frequency` with optional **Total** column. Compose contract: frontmatter `sections[]`.

Recruitment-only proposals use `ph-recruitment` — not this template.

## Composition

OKF §6.1 graph edges (one-way). Machine compose contract remains `sections[]`.

* [About InCorp](/blocks/incorp/regions/ph/about-incorp.md)
* [Credentials (visual)](/blocks/incorp/regions/ph/credentials-visual.md)
* [Fee Proposal](/blocks/incorp/regions/ph/executive-summary.md)
* [Solution and pricing intro](/blocks/incorp/regions/ph/solution-pricing-intro.md)
* [Service SLAs](/blocks/incorp/regions/ph/service-slas.md)
* [Corporate secretarial scope](/blocks/incorp/regions/ph/cs-scope.md)
* [Exclusions](/blocks/incorp/regions/ph/cs-exclusions.md)
* [CS terms](/blocks/incorp/regions/ph/cs-service-terms.md)
* [Indemnity](/blocks/incorp/regions/ph/indemnity.md)
* [Corporate Treasurer Service](/blocks/incorp/regions/ph/corporate-treasurer-service.md) (optional)
* [Nominee Director Service](/blocks/incorp/regions/ph/nominee-director-service.md) (optional)
* [Bookkeeping and tax compliance terms](/blocks/incorp/regions/ph/bookkeeping-tax-terms.md) (optional)
* [Payroll services](/blocks/incorp/regions/ph/payroll-services.md) (optional)
* [Immigration scope](/blocks/incorp/regions/ph/immigration-scope.md) (optional)
* [Estimated first invoice value](/blocks/incorp/shared/estimated-first-invoice-value.md) (optional) — [computation](/computations/first-invoice-from-fee-tables.md)
* [Unified terms and conditions](/blocks/incorp/regions/ph/unified-terms.md)
* Fee layout: [multi-frequency](/layouts/multi-frequency.md) — Total column: [fee-table-total-column](/computations/fee-table-total-column.md)
* Export shell: [Ascentium Word shell](/brand/ascentium-word-shell.md)
* Anchor lineage (§5.1): [CS / Payroll / Bookkeeping / EP (PH)](/examples/incorp-ph-cs-payroll-bookkeeping-ep.md)

Fee modules stack under `solution_and_fees` (incorporation, payroll, bookkeeping, immigrant visa per anchor tbl[4–7]). Officer / payroll / immigration legal blocks are optional — enable when SKUs selected.
