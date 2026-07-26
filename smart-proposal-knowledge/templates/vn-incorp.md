---
type: Proposal Template
template_id: vn-incorp
title: Vietnam Incorp
description: Ascentium VN fee schedule PPT deck. Anchor incorp-vn-cs-tax-payroll-tax-hr.
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

# Template: `vn-incorp`

**VN PPT** fee schedule deck. Compose contract: frontmatter `sections[]`. zh-CN placeholder shell: locale reference only — see [locale-references](/meta/locale-references.md).

## Composition

OKF §6.1 graph edges (one-way). Machine compose contract remains `sections[]`.

* [Brand intro](/blocks/incorp/regions/vn/brand-intro-visual.md)
* [Fee schedule intro](/blocks/incorp/regions/vn/fee-schedule-intro.md)
* [Contact / brand close](/blocks/incorp/regions/vn/sealed-tail-visual.md)
* Export shell: [Ascentium PPTX shell](/brand/ascentium-pptx-shell.md)
* Anchor lineage (§5.1): [VN CS / Tax / Payroll / HR (PPT)](/examples/incorp-vn-cs-tax-payroll-tax-hr.md)
