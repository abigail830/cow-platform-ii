---
type: Reference
title: Region routing
description: >-
  Default quotation layout, templates, and catalog seeds by **BU** and issuing
  region. Layouts are shape-named; region only sets defaults. See layouts/index.md.
tags: [meta, routing, region]
status: stable
generated:
  by: human:qianping
  at: 2026-07-26T12:10:00Z
sources:
  - id: layout-registry
    resource: layouts/index.md
    title: Quotation layout registry
  - id: bu-taxonomy
    resource: meta/bu-region-jurisdiction.md
    title: BU / region / jurisdiction definitions
---

# Region routing

**Region** = issuing office. **Layout** = fee-table shape ([catalog](/layouts/index.md)). Defaults are **per BU** (InCorp, Rikvin, Harneys) — not a single global region table.

## Layout selection order

1. Explicit user / agent request (any `layout_id` from [registry](/layouts/index.md))
2. Package `default_layout`
3. **BU + region** default (tables below: InCorp → Rikvin → Harneys)
4. Fallback: **`fee-billing`**

## InCorp — by issuing region

| Region | Default layout | Templates (planned) | Product catalog | Package catalog | Reference examples |
|--------|----------------|---------------------|-----------------|-----------------|------------------|
| SG | [oneoff-recurring](/layouts/oneoff-recurring.md) | [sg-incorp](/templates/index.md#template-catalog) (+ `sg-audit` special) | [sg](/catalogs/products/sg.md) | [sg](/catalogs/packages/sg.md) | anchor: [cs-ep-accounting-payroll-tax](/examples/incorp-sg-cs-ep-accounting-payroll-tax.md); special: [internal-audit PPT](/examples/incorp-sg-internal-audit.md) |
| AU | [multi-frequency](/layouts/multi-frequency.md) | [au-advisory](/templates/index.md#template-catalog) (+ `au-audit` special) | [au](/catalogs/products/au.md) | [au](/catalogs/packages/au.md) | anchor: [incorporation](/examples/incorp-au-incorporation.md); special: [audit PPT](/examples/incorp-au-audit.md) |
| PH | [multi-frequency](/layouts/multi-frequency.md) | sp-flexible | [ph](/catalogs/products/ph.md) | [ph](/catalogs/packages/ph.md) | incorp-ph-* |
| HK | TBD | sp-flexible | planned | planned | incorp-hk-cs-zh-cn |
| VN | TBD | sp-flexible | planned | planned | incorp-vn-* |
| MY | [fee-billing](/layouts/fee-billing.md) | sp-flexible | [my](/catalogs/products/my.md) | [my](/catalogs/packages/my.md) | — |
| ID | TBD | sp-flexible | planned | planned | — |
| IN | TBD | sp-flexible | planned | planned | — |
| CN | TBD | sp-flexible | planned | planned | — |

Cells marked **planned** are filled in Phase 2+.

## Rikvin — SG immigration

Rikvin is **not** a separate issuing region. It is an **InCorp SG** brand track for regulated immigration services (Employment Pass, DP, PEP/ONE Pass, education verification).

Route here when `rikvin` is in tags, or scope is immigration-only — not the generic InCorp SG row above.

| Field | Value |
|-------|-------|
| BU / brand | `incorp` + tag `rikvin` |
| Issuing region | SG (same office as InCorp SG) |
| Entity jurisdiction | SG |
| Default layout | [oneoff-recurring](/layouts/oneoff-recurring.md) |
| Templates (planned) | [sg-incorp](/templates/index.md#template-catalog) (+ Rikvin blocks; not separate template) |
| Product catalog | [sg](/catalogs/products/sg.md) — immigration SKUs |
| Package catalog | [sg](/catalogs/packages/sg.md) |
| Reference examples | [incorp-sg-rikvin-employment-pass](/examples/incorp-sg-rikvin-employment-pass.md) |

**Composition patterns**

| Pattern | Example |
|---------|---------|
| Standalone immigration proposal | Rikvin-branded fees + subsidiary disclaimer after each fee block |
| EP module inside broader InCorp SG deck | [incorp-sg-cs-ep-accounting-payroll-tax](/examples/incorp-sg-cs-ep-accounting-payroll-tax.md) — CS/accounting + EP table + Rikvin disclaimer |

**Block candidates (Phase 2):** Rikvin disclaimer (UEN / EA licence) → `blocks/incorp/regions/sg/` or `blocks/incorp/shared/`.

## Harneys — issuing region × entity jurisdiction

| Issuing region | Entity jurisdiction | Template | Reference examples |
|----------------|---------------------|----------|-------------------|
| UK | BVI | [harneys-bvi](/templates/index.md#template-catalog) | [harneys-uk-bvi-all-options](/examples/harneys-uk-bvi-all-options.md) |
| UK | Cayman | [harneys-cayman](/templates/index.md#template-catalog) | [harneys-uk-cayman-all-options](/examples/harneys-uk-cayman-all-options.md) — ~same spine as BVI |
| HK | HK | [harneys-hk](/templates/index.md#template-catalog) | [harneys-hk-incorporation](/examples/harneys-hk-incorporation.md) — own rates schedule |

## BU summary

| BU | Issuing regions | Routing section | How entity jurisdiction works |
|----|-----------------|-----------------|------------------------------|
| **InCorp** | SG, AU, PH, HK, VN, MY, ID, IN, CN | [InCorp table](#incorp--by-issuing-region) | Default: entity jurisdiction = issuing region. Cross-border: tag both explicitly. |
| **Rikvin** | SG only (`incorp` + `rikvin` tag) | [Rikvin table](#rikvin--sg-immigration) | SG immigration; shares InCorp SG layout/catalog defaults. |
| **Harneys** | HK, UK | [Harneys table](#harneys--issuing-region--entity-jurisdiction) | Entity jurisdiction ≠ region (BVI, Cayman, …). |

[BU / region / jurisdiction](/meta/bu-region-jurisdiction.md)

## Data source priority

1. **Live** — [Data Adapter](/catalogs/adapters/) — MySQL per **issuing region**; PG MDM per **entity jurisdiction** (Harneys)
2. **Seed** — `catalogs/products/{region}.md`
3. **Structure only** — [Reference Proposal](/examples/index.md)
