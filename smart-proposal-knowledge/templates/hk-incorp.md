---
type: Proposal Template
template_id: hk-incorp
title: Hong Kong Incorp
description: >-
  Generic InCorp HK Word proposal — company secretarial and compliance.
  Anchor sample is zh-CN; listed-co / IPO modules in sample are case-specific.
tags: [incorp, region:HK, jurisdiction:HK, Word, template, zh-CN]
status: draft
deliverable: word
catalog_filter:
  bu: incorp
  region: HK
  jurisdiction: HK
default_layout: custom
anchor_example: examples/incorp-hk-cs-zh-cn.md
generated:
  by: human:qianping
  at: 2026-07-26T22:45:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-hk-cs-zh-cn.md
    title: Reference Proposal — InCorp HK CS (zh-CN)
export:
  word:
    enabled: true
    shell: brand/ascentium-word-shell.md
placeholders:
  proposal_letter:
    - token: "{{proposal_date}}"
      draft_path: /facts/proposal/date
    - token: "{{project_name}}"
      draft_path: /facts/project/name
    - token: "{{client.contact_name}}"
      draft_path: /facts/client/contact_name
    - token: "{{client.entity_description}}"
      draft_path: /facts/client/entity_description
    - token: "{{our_contact.name}}"
      draft_path: /facts/our_contact/name
  fee_proposal_intro:
    - token: "{{project_name}}"
      draft_path: /facts/project/name
sections:
  - id: credentials_visual
    title: Credentials (visual)
    kind: visual_block
    required: true
    block: blocks/incorp/regions/hk/credentials-visual.md

  - id: proposal_letter
    title: Proposal letter
    kind: markdown_block
    required: true
    editable: true
    block: blocks/incorp/regions/hk/proposal-letter.md

  - id: about_hk
    title: About Ascentium HK
    kind: static_block
    required: true
    block: blocks/incorp/regions/hk/about-hk.md

  - id: project_team
    title: Project team structure
    kind: markdown_block
    required: false
    default_enabled: false
    block: blocks/incorp/regions/hk/project-team-structure.md

  - id: listing_core_team
    title: Listing services core team
    kind: markdown_block
    required: false
    default_enabled: false
    block: blocks/incorp/regions/hk/listing-core-team.md

  - id: compliance_timeline
    title: Compliance and timeline
    kind: static_block
    required: true
    block: blocks/incorp/regions/hk/compliance-and-timeline.md

  - id: solution_and_fees
    title: Fees
    kind: fee_section
    required: true
    materializer: mdm_fee_tables
    layout: custom
    intro:
      block: blocks/incorp/regions/hk/fee-proposal-intro.md
    fee_layout:
      group_by: module
      table_style: hk_cs_custom
      currency: HKD
      tables_heading: 服务费用提案

  - id: terms
    title: Terms and conditions
    kind: static_block
    required: true
    block: blocks/incorp/regions/hk/terms-general.md

  - id: scope_appendix
    title: Scope of services (appendix)
    kind: static_block
    required: true
    block: blocks/incorp/regions/hk/scope-of-services.md
---

# Template: `hk-incorp`

Generic **InCorp HK Word** proposal — company secretarial and compliance. Section spine in frontmatter `sections[]`.

Layout `custom` — HK fee-table shape still TBD in layouts registry. Anchor sample language is **zh-CN**; English deliverables may share the same spine.

**Not** Harneys HK rates schedule — use `harneys-hk`.

Listed-company / IPO sections (`project_team`, `listing_core_team`) are optional — enabled when `entity_listed_or_ipo` in engagement scope.
