---
type: Reference Proposal
title: "InCorp SG — CS / Tax / Payroll / Accounting (first invoice)"
description: >-
  Singapore Word proposal — Annual Compliance (accounting/tax/payroll) plus Full
  Finance Function Support. Anchor for sg-incorp; includes optional Estimated
  first invoice value table.
tags: [incorp, region:SG, jurisdiction:SG, Word, accounting, payroll, tax, first-invoice]
status: draft
template_id: sg-incorp
resource: references/examples/incorp-sg-CS_Tax_Payroll_Accounting_ff.docx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T23:05:00Z
sources:
  - id: extraction
    resource: references/extractions/incorp-sg-cs-tax-payroll-accounting-ff/spine.md
    title: Layer 1 spine extraction
---

# Reference: CS / Tax / Payroll / Accounting + First Invoice (SG)

Layer 1 extraction: [extraction spine](/references/extractions/incorp-sg-cs-tax-payroll-accounting-ff/spine.md).

**Primary anchor** for [`sg-incorp`](/templates/sg-incorp.md).

## Format

| Field | Value |
|-------|-------|
| Region | SG |
| BU | In.Corp |
| Deliverable | Word (legacy In.Corp template) |
| Output shell | Not Ascentium brand shell — study structure only |

## Section spine

1. Cover + TOC
2. Credentials block — About In.Corp → Key Accreditations
3. Fee Proposal letter
4. Scope of Services
5. Fees (2 fee-table modules)
6. Client details / presented-to block
7. **Estimated first invoice value** (optional) — tbl[6]
8. Terms & Conditions (4 subsections)

## Fee modules

| Module | Table | Rows | Layout |
|--------|-------|------|--------|
| Annual Compliance — Accounting/Tax/Payroll | tbl[4] | 19 | `oneoff-recurring` |
| Full Finance Function Support Package | tbl[5] | 9 | `oneoff-recurring` |

### Fee column pattern

`Services` | `One-off Fee (SGD)` | `Recurring Fee (SGD)`

### Structural footnotes (no amounts)

- Transaction-volume-based bookkeeping estimate (*)
- Audit / consolidation surcharge clause (**)
- Conditional XBRL filing block (#)

## Optional: Estimated first invoice

| Field | Value |
|-------|-------|
| Heading | `ESTIMATED FIRST INVOICE VALUE` |
| Table | tbl[6] (28 rows) |
| Template section | `first_invoice` (`derived_section`, `default_enabled: false`) |
| Derivation | One-off + first recurring period + GST 9%; excludes ad-hoc |
| Computation | [first-invoice-from-fee-tables](/computations/first-invoice-from-fee-tables.md) |
| Block | [estimated-first-invoice-value](/blocks/incorp/shared/estimated-first-invoice-value.md) |

## Distinction from other SG references

| Sample | Role |
|--------|------|
| [Rikvin Employment Pass](/examples/incorp-sg-rikvin-employment-pass.md) | Immigration-only subset; Rikvin disclaimer source |
| This file | **Anchor** — Tax + Full Finance + optional first invoice |

## Section Block promotion notes

Shared SG Word front-matter and T&C cluster promoted from this extraction. EP / incorporation fee rows — compose from catalog or [Rikvin EP sample](/examples/incorp-sg-rikvin-employment-pass.md) when needed.
