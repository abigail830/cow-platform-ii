---
type: Reference Proposal
title: "Ascentium VN — CS / Tax / Payroll / HR"
description: >-
  11-slide Vietnam services PPT with Ascentium brand intro and USD fee schedules
  for corporate services, accounting/tax, and HR/payroll modules.
tags: [incorp, region:VN, jurisdiction:VN, PPT, corporate-services, tax, payroll, HR]
status: draft
resource: references/examples/incorp-vn-CS_TAX_PAYROLL_TAX_HR.pptx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T13:00:00Z
sources:
  - id: extraction
    resource: references/extractions/incorp-vn-cs-tax-payroll-tax-hr/spine.md
    title: Layer 1 slide spine extraction
---

# Reference: Ascentium VN CS / Tax / Payroll / HR

## Format

| Field | Value |
|-------|-------|
| Region | VN |
| BU | Ascentium |
| Deliverable | PPT (11 slides) |
| Currency | USD |

## Slide spine

| # | Section |
|---|---------|
| 1 | Cover |
| 2–5 | Brand intro (management, KPIs, footprint, offerings) |
| 6–7 | **Vietnam Fee Schedule** — Corporate Services |
| 8 | Accounting & Tax Compliance |
| 9 | HR and Payroll |
| 10–11 | We Are Ascentium + Contact (sealed tail) |

## Fee pattern

| # | Service | Occurrence | Fees (USD) |

Three fee-schedule slides by service line. Supports ranges (`{{fee_amount}} – {{fee_amount}}`) and TBC rows.

## Shell relationship

Intro + sealed tail match [ascentium-pptx-shell](/brand/ascentium-pptx-shell.md) rhythm; content slides 6–9 are proposal-specific.

## Compare

[incorp-vn-services-zh-cn](incorp-vn-services-zh-cn.md) — same structure but zh-CN with `[[placeholder]]` template rows instead of concrete fees.
