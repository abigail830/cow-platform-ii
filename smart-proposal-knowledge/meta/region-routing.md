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

Example ↔ template mapping lives in [examples/index.md](/examples/index.md) only.

## Layout selection order

1. Explicit user / agent request (any `layout_id` from [registry](/layouts/index.md))
2. Package `default_layout`
3. **BU + region** default (tables below: InCorp → Rikvin → Harneys)
4. Fallback: **`fee-billing`**

## InCorp — by issuing region

| Region | Default layout | Default `template_id` | Live catalog adapter |
|--------|----------------|----------------------|----------------------|
| SG | [oneoff-recurring](/layouts/oneoff-recurring.md) | `sg-incorp` (+ `sg-audit` special) | [incorp-sg](/catalogs/adapters/incorp-sg.md) |
| AU | [multi-frequency](/layouts/multi-frequency.md) | `au-advisory` (+ `au-audit` special) | [incorp-au](/catalogs/adapters/incorp-au.md) |
| PH | [multi-frequency](/layouts/multi-frequency.md) | `ph-incorp` (+ `ph-recruitment` special) | planned |
| HK | TBD | `hk-incorp` | planned |
| VN | TBD | `vn-incorp` | planned |
| MY | [fee-billing](/layouts/fee-billing.md) | `sp-flexible` | planned |
| ID | TBD | `sp-flexible` | planned |
| IN | TBD | `sp-flexible` | planned |
| CN | TBD | `sp-flexible` | planned |

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
| Default `template_id` | `sg-incorp` (Rikvin blocks; not a separate template) |
| Product catalog | [sg adapter](/catalogs/adapters/incorp-sg.md) — immigration SKUs |
| Package catalog | same table (`is_package = true`) |

**Composition patterns**

| Pattern | Notes |
|---------|-------|
| Standalone immigration proposal | Rikvin-branded fees + subsidiary disclaimer after each fee block |
| EP module inside broader InCorp SG deck | CS/accounting + EP table + Rikvin disclaimer on same `sg-incorp` spine |

**Block candidates (Phase 2):** Rikvin disclaimer (UEN / EA licence) → `blocks/incorp/regions/sg/`.

## Harneys — issuing region × entity jurisdiction

| Issuing region | Entity jurisdiction | `template_id` |
|----------------|---------------------|---------------|
| UK | BVI | `harneys-uk` |
| UK | Cayman | `harneys-uk` |
| HK | HK | `harneys-hk` |

## BU summary

| BU | Issuing regions | Routing section | How entity jurisdiction works |
|----|-----------------|-----------------|------------------------------|
| **InCorp** | SG, AU, PH, HK, VN, MY, ID, IN, CN | [InCorp table](#incorp--by-issuing-region) | Default: entity jurisdiction = issuing region. Cross-border: tag both explicitly. |
| **Rikvin** | SG only (`incorp` + `rikvin` tag) | [Rikvin table](#rikvin--sg-immigration) | SG immigration; shares InCorp SG layout/catalog defaults. |
| **Harneys** | HK, UK | [Harneys table](#harneys--issuing-region--entity-jurisdiction) | Entity jurisdiction ≠ region (BVI, Cayman, …). |

[BU / region / jurisdiction](/meta/bu-region-jurisdiction.md)

## Data source priority

1. **Live** — [Data Adapter](/catalogs/adapters/) — PostgreSQL per **InCorp issuing region** (SG, AU); PG MDM per **entity jurisdiction** (Harneys, planned)
2. **Seed** — `catalogs/products/{region}.md` (optional offline fallback; not required when live adapter exists)
3. **Structure only** — Reference Proposal concepts (`template_id` in frontmatter; catalog at [examples/index.md](/examples/index.md))

Catalog search and matching: [playbook](/playbooks/catalog-search-and-matching.md).
