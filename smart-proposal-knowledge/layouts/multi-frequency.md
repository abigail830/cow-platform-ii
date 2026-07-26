---
type: Quotation Layout
layout_id: multi-frequency
title: Scope · Multi-frequency fees
description: >-
  Fee table with Monthly, Quarterly, Annual, Once-off, and Total columns. Any
  region may use this layout; default for PH and AU.
legacy_ids: [philippines_australia]
tags: [layout, quotation, multi-frequency]
status: draft
generated:
  by: process:migrate-legacy/v1
  at: 2026-07-26T13:30:00Z
sources:
  - id: legacy-layout
    resource: file:///Users/qianping/Documents/Source/ascentium/axon-flow/backend/agent_platform/agents/x-proposal/skills/sp-proposal-builder/references/quotation-layout-philippines-australia.md
    title: Legacy quotation-layout-philippines-australia.md
  - id: ref-ph
    resource: references/examples/incorp-ph-CS-payroll-bookkeeping-ep.docx
    title: Reference sample — PH CS / payroll / bookkeeping / EP
  - id: ref-au
    resource: references/examples/incorp-au-Incorporation.docx
    title: Reference sample — AU incorporation
---

# Layout: `multi-frequency`

Describes **column shape**, not a region. Legacy id was `philippines_australia` (misleading name).

## Columns

| Column | Key in `fees` |
|--------|----------------|
| Scope of Work | `title` + `scope_text` |
| Monthly | `fees.monthly` |
| Quarterly | `fees.quarterly` |
| Annual | `fees.annual` |
| Once-off | `fees.once_off` |
| Total | `fees.total` — **derived** via [fee-table-total-column](/computations/fee-table-total-column.md) when `show_total_column: true` |

Optional section-level **Total** toggle (`data.show_total`). Per-row Total is materialized at compose time — do not paste amounts in Section Blocks.

## Row JSON shape

```json
{
  "row_id": "row-1",
  "title": "Business Registration",
  "scope_text": "{{scope_description}}",
  "fees": {
    "currency": "PHP",
    "monthly": null,
    "quarterly": null,
    "annual": null,
    "once_off": null,
    "total": null
  }
}
```

## Related layouts

- [oneoff-recurring](/layouts/oneoff-recurring.md)
- [fee-billing](/layouts/fee-billing.md)

## Templates using this layout

* [au-advisory](/templates/au-advisory.md) — InCorp AU Word
* [ph-incorp](/templates/ph-incorp.md) — InCorp PH corporate secretarial
