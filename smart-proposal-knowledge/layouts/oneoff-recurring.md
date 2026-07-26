---
type: Quotation Layout
layout_id: oneoff-recurring
title: Scope · One-off · Recurring
description: >-
  Three-column fee table — scope/services, one-off fee, recurring fee. Any region
  may use this layout; default for SG.
legacy_ids: [singapore]
tags: [layout, quotation, oneoff, recurring]
status: draft
generated:
  by: process:migrate-legacy/v1
  at: 2026-07-26T13:30:00Z
sources:
  - id: legacy-layout
    resource: file:///Users/qianping/Documents/Source/ascentium/axon-flow/backend/agent_platform/agents/x-proposal/skills/sp-proposal-builder/references/quotation-layout-singapore.md
    title: Legacy quotation-layout-singapore.md (layout_id singapore)
  - id: ref-cs-ep
    resource: references/examples/incorp-sg-CS_EP_Accounting_Payroll_TAX.docx
    title: Reference sample — multi-module SG Word proposal
---

# Layout: `oneoff-recurring`

Describes **column shape**, not a region. See [layout registry](/layouts/index.md) and [region defaults](/meta/region-routing.md).

## Columns

| Column | Header in Word (typical) | Purpose |
|--------|--------------------------|---------|
| `scope` | Services | Category heading + scope bullets |
| `one_off` | One-off Fee | Once-off amount / text or `-` |
| `recurring` | Recurring Fee | Recurring amount / text or `-` |

Currency is per row/region (SGD, USD, …) — not fixed by layout.

## Row JSON shape

```json
{
  "row_id": "row-1",
  "source_type": "sku",
  "source_id": "SG-INC-001",
  "is_custom": false,
  "title": "Incorporation",
  "scope_bullets": ["{{scope_bullet}}"],
  "fees": {
    "currency": "SGD",
    "one_off": { "amount": null, "display": "{{fee_amount}} per entity" },
    "recurring": null
  }
}
```

## Catalog mapping

| Catalog field | Layout field |
|---------------|--------------|
| `service_name` | `title` |
| scope bullets | `scope_bullets` |
| `one_off_*` | `fees.one_off` |
| `recurring_*` + period | `fees.recurring` |

## Common in reference samples

- [incorp-sg-cs-ep-accounting-payroll-tax](/examples/incorp-sg-cs-ep-accounting-payroll-tax.md)
- [incorp-sg-rikvin-employment-pass](/examples/incorp-sg-rikvin-employment-pass.md)

## Related layouts

- [multi-frequency](/layouts/multi-frequency.md) — multiple billing period columns
- [fee-billing](/layouts/fee-billing.md) — Service · Fee · Billing Frequency
