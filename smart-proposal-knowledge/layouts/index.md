---
type: Layout Registry
title: Quotation layout registry
description: >-
  Meaningful layout modes by column shape. BU + issuing region may set a default;
  any proposal may switch layouts explicitly. See meta/region-routing.md per BU.
tags: [meta, layouts, registry]
status: draft
generated:
  by: human:qianping
  at: 2026-07-26T13:30:00Z
sources:
  - id: legacy-registry
    resource: file:///Users/qianping/Documents/Source/ascentium/axon-flow/backend/agent_platform/agents/x-proposal/skills/sp-proposal-builder/references/quotation-layout-registry.md
    title: Legacy quotation layout registry
---

# Quotation layouts

Layouts are named by **fee-table shape**, not by region. **Default layout** is resolved per **BU + issuing region** (not global); users and agents may always override.

## Layout catalog

| `layout_id` | Concept | Columns (summary) | Legacy id |
|-------------|---------|-------------------|-----------|
| [oneoff-recurring](oneoff-recurring.md) | Scope · One-off · Recurring | Services · One-off · Recurring | `singapore` |
| [multi-frequency](multi-frequency.md) | Scope · Multi-frequency | Scope · Monthly · Quarterly · Annual · Once-off · Total | `philippines_australia` |
| [fee-billing](fee-billing.md) | Service · Fee · Billing | Service · Fee · Billing Frequency | `malaysia` |
| `custom` | User-defined columns | (inline in proposal state) | — |

## Selection order

1. Explicit user request (“用 multi-frequency 格式”)
2. Package `default_layout`
3. BU + region default ([region routing](/meta/region-routing.md) — **InCorp** table; Harneys/Rikvin separate)
4. Fallback: **`fee-billing`**

## Defaults by BU

Catalog layouts (`oneoff-recurring`, `multi-frequency`, `fee-billing`) are **InCorp SKU** quotation shapes. Do not treat issuing region alone as a global layout key — the same region code can mean different BUs (e.g. HK: InCorp vs Harneys).

| BU | Default layout source | Typical `layout_id` |
|----|----------------------|---------------------|
| **InCorp** | [InCorp — by issuing region](/meta/region-routing.md#incorp--by-issuing-region) | SG → `oneoff-recurring`; PH/AU → `multi-frequency`; MY → `fee-billing`; HK/VN/ID/IN/CN → TBD |
| **Harneys** | [Harneys — region × entity jurisdiction](/meta/region-routing.md#harneys--issuing-region--entity-jurisdiction) | Usually **`custom`** (rates matrix, year × fee) — not catalog SKU layouts |
| **Rikvin** | [Rikvin — SG immigration](/meta/region-routing.md#rikvin--sg-immigration) | `oneoff-recurring`; disclaimer blocks differ from generic InCorp SG |

Full routing tables: [region-routing](/meta/region-routing.md).
