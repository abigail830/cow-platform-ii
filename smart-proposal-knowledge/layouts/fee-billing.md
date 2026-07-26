---
type: Quotation Layout
layout_id: fee-billing
title: Service · Fee · Billing frequency
description: >-
  Three-column fee table — service description, fee amount/text, billing frequency
  label. Global fallback layout; default for MY.
legacy_ids: [malaysia]
tags: [layout, quotation, billing-frequency]
status: draft
generated:
  by: process:migrate-legacy/v1
  at: 2026-07-26T13:30:00Z
sources:
  - id: legacy-layout
    resource: file:///Users/qianping/Documents/Source/ascentium/axon-flow/backend/agent_platform/agents/x-proposal/skills/sp-proposal-builder/references/quotation-layout-malaysia.md
    title: Legacy quotation-layout-malaysia.md (layout_id malaysia)
---

# Layout: `fee-billing`

Describes **column shape**, not a region. Legacy id was `malaysia` (used as global default).

## Columns

| Column | Purpose |
|--------|---------|
| Service | Category heading + nested bullets + conditional notes |
| Fee | Professional fee, exclusions, conditional fee text |
| Billing Frequency | e.g. once-off / annual / blank |

## Row JSON shape

```json
{
  "row_id": "row-1",
  "source_type": "package",
  "source_id": "PKG-MY-INC-CS",
  "is_custom": false,
  "title": "Incorporation",
  "scope_bullets": ["{{scope_bullet}}"],
  "fees": {
    "currency": "MYR",
    "amount": null,
    "billing_frequency": "once-off"
  }
}
```

## Related layouts

- [oneoff-recurring](/layouts/oneoff-recurring.md)
- [multi-frequency](/layouts/multi-frequency.md)

## Templates using this layout

*(No draft template yet — default for InCorp MY per [region routing](/meta/region-routing.md).)*
