---
type: Extraction Spine
title: "Layer 1 spine — incorp-sg-cs-tax-payroll-accounting-ff"
description: PII-redacted section index from office ingest (Layer 1 staging).
status: draft
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T23:05:00Z
sources:
  - id: reference-proposal
    resource: examples/incorp-sg-cs-tax-payroll-accounting-ff.md
    title: InCorp SG — CS / Tax / Payroll / Accounting (first invoice)
  - id: binary
    resource: references/examples/incorp-sg-CS_Tax_Payroll_Accounting_ff.docx
    title: Original sample document
---

# Spine (PII-redacted)

Source: `incorp-sg-CS_Tax_Payroll_Accounting_ff.docx`

## Document stats

- 182 paragraphs, 6 tables, 39 images
- Footer: incorp.asia confidentiality notice
- Format: Word (In.Corp legacy template — not Ascentium brand shell)
- Primary `sg-incorp` anchor — includes optional **Estimated first invoice value** section

## Section spine (H1)

| Order | Section |
|-------|---------|
| 1 | Cover — `IN.CORP GLOBAL PROPOSAL` / `For {{client.company_name}}` |
| 2 | Table of Contents |
| 3 | About In.Corp |
| 4 | Snapshot |
| 5 | Locations |
| 6 | Our Full Range of Corporate Services ACROSS ASIA PACIFIC |
| 7 | Key Accreditations And Partners |
| 8 | RE: Fee Proposal (letter) |
| 9 | SCOPE OF SERVICES |
| 10 | FEES (multi-table) |
| 11 | Client details / presented-to block (pre-T&C) |
| 12 | **ESTIMATED FIRST INVOICE VALUE** (optional) — tbl[6], 28 rows |
| 13 | Terms & Conditions |
| 14 | Formal Service Agreements |
| 15 | Termination |
| 16 | MISC Terms |
| 17 | Governing Law |

## Scope modules (FEES)

1. **Annual Compliance Services - Accounting/Tax/Payroll** — tbl[4], 19 rows + footnotes (*, **, # XBRL conditional)
2. **Full Finance Function Support Package** — tbl[5], 9 rows + footnotes (*, #)

No Employment Pass / incorporation SKU table in this sample — EP pattern: [Rikvin Employment Pass](/examples/incorp-sg-rikvin-employment-pass.md).

## Fee table pattern

| Services | One-off Fee (SGD) | Recurring Fee (SGD) |

Maps to [oneoff-recurring](/layouts/oneoff-recurring.md).

## Estimated first invoice (tbl[6])

- Heading: `ESTIMATED FIRST INVOICE VALUE`
- Placed **before** Formal Service Agreements cluster (after client-details block)
- Line-item rollup table (28 rows) — validates template `first_invoice` derived section (`default_enabled: false`)
- Block: [estimated-first-invoice-value](/blocks/incorp/shared/estimated-first-invoice-value.md)
- Computation: [first-invoice-from-fee-tables](/computations/first-invoice-from-fee-tables.md)

## Notable footnotes (structure only)

- Bookkeeping fees tied to transaction volume estimate (*)
- Audit / consolidation surcharge pattern (**)
- XBRL filing conditional block (#)

## Notes

- No EP / incorporation fee table in anchor — use [Rikvin EP sample](/examples/incorp-sg-rikvin-employment-pass.md) for immigration modules
- First invoice — optional [shared block](/blocks/incorp/shared/estimated-first-invoice-value.md) + [attested computation](/computations/first-invoice-from-fee-tables.md); amounts materialized from fee tables
