---
type: Section Block
title: Estimated first invoice value
description: >-
  Optional fee rollup table before terms — heading and column shape only.
  Amounts materialize via first-invoice attested computation from solution_and_fees.
tags: [incorp, shared, fees, first-invoice, optional]
render: derived_table
status: draft
selection:
  mode: conditional
  include_when: user or agent enables first_invoice section on template
  trigger_source: solution_and_fees
  default_enabled: false
generated:
  by: process:office-extract/v1
  at: 2026-07-26T23:25:00Z
sources:
  - id: anchor-structure
    resource: references/extractions/incorp-sg-cs-tax-payroll-accounting-ff/spine.md
    title: Layer 1 spine — ESTIMATED FIRST INVOICE VALUE tbl[6]
  - id: anchor-example
    resource: examples/incorp-sg-cs-tax-payroll-accounting-ff.md
    title: Reference Proposal — SG Tax + first invoice
---

## ESTIMATED FIRST INVOICE VALUE

Rollup table materialized by [First invoice from fee tables](/computations/first-invoice-from-fee-tables.md). **Do not** paste fee amounts or totals in this block — rows come from `solution_and_fees` at compose time.

| Services | Price ({{currency}}) | {{tax_label}} ({{tax_rate_display}}) | Total ({{currency}}) |
|----------|----------------------|----------------------------------------|----------------------|
| *(one row per selected fee line)* | | | |
| **Total** | *(sum)* | *(sum)* | *(sum)* |

Place this section **after** fee modules and client-details block, **before** terms and conditions (SG anchor order).
