---
type: Proposal Template
template_id: ph-recruitment
title: Philippines Recruitment & Executive Search
description: InCorp PH ITS recruitment proposal — fee % tables, guarantee, conforme, CDD, recruitment GTC.
tags: [incorp, region:PH, jurisdiction:PH, Word, template, recruitment, executive-search]
status: draft
deliverable: word
catalog_filter:
  bu: incorp
  region: PH
  jurisdiction: PH
default_layout: custom
anchor_example: examples/incorp-ph-recruitment.md
generated:
  by: human:qianping
  at: 2026-07-26T22:15:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-ph-recruitment.md
    title: Reference Proposal — PH Recruitment & Executive Search
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

  - id: fee_proposal_letter
    title: Fee proposal letter
    kind: markdown_block
    required: true
    editable: true
    block: blocks/incorp/regions/ph/recruitment/fee-proposal-letter.md

  - id: services_fees_intro
    title: Services and fees
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/recruitment/services-fees-intro.md

  - id: solution_and_fees
    title: Recruitment fees
    kind: fee_section
    required: true
    materializer: mdm_fee_tables
    layout: custom
    intro:
      block: blocks/incorp/regions/ph/recruitment/recruitment-fees-intro.md
    fee_layout:
      group_by: module
      table_style: recruitment_percentage
      currency: PHP
      tables_heading: Recruitment and executive search

  - id: guarantee_period
    title: Guarantee period
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/recruitment/guarantee-period.md

  - id: payment_terms
    title: Payment
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/recruitment/payment-terms.md

  - id: client_conforme
    title: Client conforme
    kind: markdown_block
    required: true
    editable: true
    block: blocks/incorp/regions/ph/recruitment/client-conforme.md

  - id: cdd_documents
    title: CDD documents
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/recruitment/cdd-documents.md

  - id: recruitment_terms
    title: General terms and conditions
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/recruitment/recruitment-terms.md
---

# Template: `ph-recruitment`

InCorp **Philippines recruitment & executive search** (ITS) Word proposal. Layout `custom` — recruitment fee percentage tables, not catalog SKU layouts. Section spine in frontmatter `sections[]`.

**Not** corporate secretarial — use `ph-cs`.

Shared PH credentials front-matter reuses `about-incorp` and `credentials-visual` blocks (identical spine to `ph-cs` anchor).

Fee tables (tbl[4]–tbl[5]), client details (tbl[6]), CDD checklist (tbl[7]), and annex (tbl[8]) materialize via `solution_and_fees` / form materializers — amounts not stored in blocks.
