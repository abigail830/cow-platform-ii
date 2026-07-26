---
type: Proposal Template
template_id: sg-incorp
title: Singapore Incorp
description: >-
  Generic InCorp SG Word proposal — CS, EP, tax, accounting, payroll, and
  multi-service packages. Anchor spine from cs-tas-payroll-accounting-ff sample
  (includes optional first invoice).
tags: [incorp, region:SG, jurisdiction:SG, Word, template]
status: draft
deliverable: word
catalog_filter:
  bu: incorp
  region: SG
  jurisdiction: SG
default_layout: oneoff-recurring
anchor_example: examples/incorp-sg-cs-tas-payroll-accounting-ff.md
generated:
  by: human:qianping
  at: 2026-07-26T14:15:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-sg-cs-tas-payroll-accounting-ff.md
    title: Reference Proposal — CS / TAS / Payroll / Accounting (first invoice)
export:
  word:
    enabled: true
    shell: brand/ascentium-word-shell.md
document_title:
  prefix: FEE PROPOSAL
  name_from: [client.company_name, client.contract_name]
  fallback: FEE PROPOSAL
placeholders:
  executive_summary:
    - token: "{{proposal_date}}"
      draft_path: /facts/proposal/date
    - token: "{{client.contact_name}}"
      draft_path: /facts/client/contact_name
    - token: "{{client.company_name}}"
      draft_path: /facts/client/company_name
    - token: "{{our_contact.name}}"
      draft_path: /facts/our_contact/name
    - token: "{{our_contact.title}}"
      draft_path: /facts/our_contact/title
  scope_of_service:
    - token: "{{selected_packages_summary}}"
      draft_path: derived
      empty: "— (select packages or services in Solution and pricing)"
  fee_table:
    - token: "{{client.company_name}}"
      draft_path: /facts/client/company_name
sections:
  - id: about_incorp
    title: About Incorp
    kind: static_block
    required: true
    editable: false
    block: blocks/incorp/regions/sg/about-incorp.md

  - id: credentials_visual
    title: Credentials (visual)
    kind: visual_block
    required: true
    editable: false
    block: blocks/incorp/regions/sg/credentials-visual.md

  - id: executive_summary
    title: Executive Summary
    kind: markdown_block
    required: true
    editable: true
    block: blocks/incorp/regions/sg/executive-summary.md

  - id: scope_of_service
    title: Scope of service
    kind: markdown_block
    required: true
    editable: true
    block: blocks/incorp/regions/sg/scope-of-service.md

  - id: solution_and_fees
    title: Solution and professional services
    kind: fee_section
    required: true
    materializer: mdm_fee_tables
    layout: layouts/oneoff-recurring.md
    intro:
      block: blocks/incorp/regions/sg/solution-pricing-intro.md
      editable: true
    fee_layout:
      group_by: package
      table_style: one_off_recurring
      currency: SGD
      tables_heading: Fees
      column_widths:
        service: "60%"
        one_off: "20%"
        recurring: "20%"
      service_columns:
        service_name: true
        description: false
        scope_of_work: true
      show_line_amount: true
      footnotes: aggregate
    optional_blocks:
      - id: rikvin_disclaimer
        block: blocks/incorp/regions/sg/rikvin-disclaimer.md
        append_after_fee_modules: [employment_pass, immigration]

  - id: appendices
    title: Appendices
    kind: collection
    required: false
    default_enabled: false
    collection:
      child_kind: markdown_block
    render:
      block_as_chapter: true

  - id: first_invoice
    title: Estimated first invoice value
    kind: derived_section
    required: false
    default_enabled: false
    derivation:
      type: first_invoice_from_fee_tables
      source_section: solution_and_fees
      tax:
        rate: 0.09
        label: GST
        rate_display: 9%
      exclude:
        pattern: '(?i)(?<![a-z-])ad[\s-]?hoc(?![a-z])'
        fields: [preview_primary, scope_of_work_display, service_name, description, scope_of_work]
    agent_guidance: >
      Enable for first-invoice summary from solution_and_fees rows. Anchor sample
      (incorp-sg-cs-tas-payroll-accounting-ff) places tbl[6] before T&C. Excludes
      ad-hoc services. One-off plus first recurring period only (not annualised).

  - id: terms
    title: Terms and conditions
    kind: static_block
    required: true
    editable: false
    block: blocks/incorp/regions/sg/terms-incorp.md
---

# Template: `sg-incorp`

Generic **InCorp SG Word** proposal — CS, EP, tax, accounting, payroll; fee modules stack under `solution_and_fees`; layout `oneoff-recurring`. Compose contract: frontmatter `sections[]`.

**Not** for RA / internal audit — use `sg-audit`.

## Composition

OKF §6.1 graph edges (one-way). Machine compose contract remains `sections[]`.

* [About Incorp](/blocks/incorp/regions/sg/about-incorp.md)
* [Credentials (visual)](/blocks/incorp/regions/sg/credentials-visual.md)
* [Executive Summary](/blocks/incorp/regions/sg/executive-summary.md)
* [Scope of service](/blocks/incorp/regions/sg/scope-of-service.md)
* [Solution and pricing intro](/blocks/incorp/regions/sg/solution-pricing-intro.md)
* [Rikvin disclaimer](/blocks/incorp/regions/sg/rikvin-disclaimer.md) (optional)
* [Terms and conditions](/blocks/incorp/regions/sg/terms-incorp.md)
* Fee layout: [oneoff-recurring](/layouts/oneoff-recurring.md)
* Export shell: [Ascentium Word shell](/brand/ascentium-word-shell.md)
* Anchor lineage (§5.1): [CS / TAS / Payroll / Accounting + first invoice (SG)](/examples/incorp-sg-cs-tas-payroll-accounting-ff.md)

Immigration fees append optional `rikvin_disclaimer` block after EP modules (`append_after_fee_modules`).

## Fee modules (typical)

| Module (anchor) | Typical SKUs |
|-----------------|--------------|
| Corporate Secretarial / Incorporation | Incorporation, CS annual |
| Employment Pass Application | EP, DP, PEP + rikvin disclaimer |
| Annual Compliance — Accounting/Tax/Payroll | Bookkeeping, tax, payroll |
| Other Services | Ad-hoc / misc |

## Catalog & routing

Products and packages catalogs are Phase 2 (`catalogs/products/sg.md`, `catalogs/packages/sg.md`). Region default: [region-routing](/meta/region-routing.md#incorp--by-issuing-region).
