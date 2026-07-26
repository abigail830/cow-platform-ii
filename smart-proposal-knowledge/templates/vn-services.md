---
type: Proposal Template
template_id: vn-services
title: Vietnam Services (PPT)
description: Ascentium VN services fee schedule deck. Anchor incorp-vn-cs-tax-payroll-tax-hr.
tags: [incorp, region:VN, jurisdiction:VN, PPT, template]
status: draft
deliverable: pptx
catalog_filter:
  bu: incorp
  region: VN
  jurisdiction: VN
default_layout: custom
anchor_example: examples/incorp-vn-cs-tax-payroll-tax-hr.md
generated:
  by: human:qianping
  at: 2026-07-26T15:00:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-vn-cs-tax-payroll-tax-hr.md
    title: Reference Proposal — VN CS / Tax / Payroll / HR
export:
  pptx:
    enabled: true
    shell: brand/ascentium-pptx-shell.md
sections:
  - id: cover
    title: Cover
    kind: shell_zone
    required: true

  - id: brand_intro
    title: Brand intro
    kind: visual_block
    required: true
    block: blocks/incorp/regions/vn/brand-intro-visual.md

  - id: fee_schedule
    title: Vietnam fee schedule
    kind: fee_section
    required: true
    materializer: mdm_fee_tables
    layout: custom
    intro:
      block: blocks/incorp/regions/vn/fee-schedule-intro.md
    fee_modules:
      - corporate_services
      - accounting_tax_compliance
      - hr_payroll

  - id: sealed_tail
    title: Contact / brand close
    kind: visual_block
    required: true
    block: blocks/incorp/regions/vn/sealed-tail-visual.md
---

# Template: `vn-services`

**VN PPT** fee schedule deck. Section spine in frontmatter `sections[]`. A zh-CN placeholder variant shares this spine with different fee row placeholders (unmapped).

Export shell in frontmatter `export`.
