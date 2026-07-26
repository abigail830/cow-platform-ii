---
type: Reference Proposal
title: "InCorp SG — CS / EP / Accounting / Payroll / Tax"
description: >-
  Multi-service Singapore Word proposal combining incorporation, employment pass,
  and annual compliance (accounting/tax/payroll). Structural index only.
tags: [incorp, region:SG, jurisdiction:SG, Word, incorporation, employment-pass, accounting, payroll, tax]
status: draft
template_id: sg-incorp
resource: references/examples/incorp-sg-CS_EP_Accounting_Payroll_TAX.docx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T12:45:00Z
sources:
  - id: extraction
    resource: references/extractions/incorp-sg-cs-ep-accounting-payroll-tax/spine.md
    title: Layer 1 spine extraction
---

# Reference: CS + EP + Accounting / Payroll / Tax (SG)

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
5. Fees (4 fee-table modules)
6. Terms & Conditions (4 subsections)

## Fee modules

| Module | Table | Rows | Layout |
|--------|-------|------|--------|
| Corporate Secretarial / Incorporation | tbl[4] | 6 | `oneoff-recurring` |
| Employment Pass Application | tbl[5] | 3 | `oneoff-recurring` |
| Annual Compliance — Accounting/Tax/Payroll | tbl[6] | 8 | `oneoff-recurring` |
| Other Services | tbl[7] | 2 | `oneoff-recurring` |

### Fee column pattern

`Services` | `One-off Fee (SGD)` | `Recurring Fee (SGD)`

### Structural footnotes (no amounts)

- Transaction-volume-based bookkeeping estimate (*)
- Audit / consolidation surcharge clause (**)
- Conditional XBRL filing block (#)

## Section Block promotion notes

Shared SG Word front-matter (About → Accreditations) and T&C cluster appear across multiple SG samples — promote only after cross-sample review.
