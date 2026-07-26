---
type: Reference Proposal
title: "InCorp PH — CS / Payroll / Bookkeeping / EP"
description: >-
  Philippines Word proposal — incorporation post-compliance, payroll, bookkeeping/
  tax, immigrant visa, SERVICE SLAs, and extended legal terms. Anchor for ph-incorp.
tags: [incorp, region:PH, jurisdiction:PH, Word, company-secretary, payroll, bookkeeping, immigration, SLA]
status: draft
template_id: ph-incorp
resource: references/examples/incorp-ph-CS-payroll-bookkeeping-ep.docx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T23:40:00Z
sources:
  - id: extraction
    resource: references/extractions/incorp-ph-cs-payroll-bookkeeping-ep/spine.md
    title: Layer 1 spine extraction
---

# Reference: InCorp PH CS / Payroll / Bookkeeping / EP

Layer 1 extraction: [extraction spine](/references/extractions/incorp-ph-cs-payroll-bookkeeping-ep/spine.md).

**Primary anchor** for [`ph-incorp`](/templates/ph-incorp.md).

## Format

| Field | Value |
|-------|-------|
| Region | PH |
| BU | In.Corp PH |
| Deliverable | Word |
| Currency | PHP |
| Layout | `multi-frequency` with **Total** column |

## Section spine

1. Cover + TOC + credentials
2. RE: FEE PROPOSAL letter
3. **SERVICES AND FEES** — 4 fee-table modules (tbl[4–7])
4. **SERVICE SLAs** — tbl[8]; deposit; refund policy tbl[9]
5. **CORPORATE SECRETARIAL** — scope / exclusions / terms / indemnity
6. **Corporate Treasurer** / **Nominee Director** officer modules
7. **Bookkeeping & tax** terms; **Payroll** scope/terms (schedule tbl[10])
8. **Immigration** scope / exclusions
9. **UNIFIED TERMS AND CONDITIONS**

## Fee modules

| Module | Table | Layout notes |
|--------|-------|--------------|
| Incorporation and post-compliance | tbl[4] | Monthly · Annually · One-off · Total |
| Payroll services | tbl[5] | Same |
| General bookkeeping and tax compliance | tbl[6] | Same |
| Immigrant visa (PRV) | tbl[7] | One-off · Total |

### Total column

Derived per row via [fee-table-total-column](/computations/fee-table-total-column.md) — `once_off + monthly×12 + quarterly×4 + annual`; non-numeric / Custom rows leave Total empty.

## PH-specific modules

| Module | Section Block |
|--------|---------------|
| SERVICE SLAs + refund | [service-slas](/blocks/incorp/regions/ph/service-slas.md) |
| CS scope + exclusions | [cs-scope](/blocks/incorp/regions/ph/cs-scope.md), [cs-exclusions](/blocks/incorp/regions/ph/cs-exclusions.md) |
| Officer services | [corporate-treasurer-service](/blocks/incorp/regions/ph/corporate-treasurer-service.md), [nominee-director-service](/blocks/incorp/regions/ph/nominee-director-service.md) |
| Bookkeeping / payroll terms | [bookkeeping-tax-terms](/blocks/incorp/regions/ph/bookkeeping-tax-terms.md), [payroll-services](/blocks/incorp/regions/ph/payroll-services.md) |
| Immigration | [immigration-scope](/blocks/incorp/regions/ph/immigration-scope.md) |

## Distinction from other PH references

| Sample | Role |
|--------|------|
| [Recruitment (PH)](/examples/incorp-ph-recruitment.md) | ITS recruitment — `ph-recruitment` |
| This file | **Anchor** — multi-service CS + payroll + bookkeeping + EP |
