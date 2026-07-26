---
type: Proposal Template
template_id: ph-incorp
title: Philippines Incorp
description: InCorp PH corporate secretarial Word proposal with SERVICE SLAs module. Anchor incorp-ph-cs.
tags: [incorp, region:PH, jurisdiction:PH, Word, template]
status: draft
deliverable: word
catalog_filter:
  bu: incorp
  region: PH
  jurisdiction: PH
default_layout: multi-frequency
anchor_example: examples/incorp-ph-cs.md
generated:
  by: human:qianping
  at: 2026-07-26T15:00:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-ph-cs.md
    title: Reference Proposal — PH Corporate Secretarial
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

  - id: service_slas
    title: Service SLAs
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/service-slas-marker.md

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

  - id: unified_terms
    title: Unified terms and conditions
    kind: static_block
    required: true
    block: blocks/incorp/regions/ph/unified-terms.md
---

# Template: `ph-incorp`

InCorp **Philippines corporate secretarial** Word proposal. Layout `multi-frequency`. Compose contract: frontmatter `sections[]`.

Recruitment-only proposals use `ph-recruitment` — not this template.

## Composition

OKF §6.1 graph edges (one-way). Machine compose contract remains `sections[]`.

* [About InCorp](/blocks/incorp/regions/ph/about-incorp.md)
* [Credentials (visual)](/blocks/incorp/regions/ph/credentials-visual.md)
* [Fee Proposal](/blocks/incorp/regions/ph/executive-summary.md)
* [Solution and pricing intro](/blocks/incorp/regions/ph/solution-pricing-intro.md)
* [Service SLAs](/blocks/incorp/regions/ph/service-slas-marker.md)
* [Corporate secretarial scope](/blocks/incorp/regions/ph/cs-scope.md)
* [Exclusions](/blocks/incorp/regions/ph/cs-exclusions.md)
* [CS terms](/blocks/incorp/regions/ph/cs-service-terms.md)
* [Indemnity](/blocks/incorp/regions/ph/indemnity.md)
* [Unified terms and conditions](/blocks/incorp/regions/ph/unified-terms.md)
* Fee layout: [multi-frequency](/layouts/multi-frequency.md)
* Export shell: [Ascentium Word shell](/brand/ascentium-word-shell.md)
* Anchor lineage (§5.1): [Corporate Secretarial (PH)](/examples/incorp-ph-cs.md)
