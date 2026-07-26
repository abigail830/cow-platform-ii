---
type: Reference Proposal
title: "InCorp SG — Rikvin Employment Pass Application"
description: >-
  Singapore Word proposal focused on Rikvin immigration services (DP, PEP/ONE Pass,
  education verification). Structural index only.
tags: [incorp, region:SG, jurisdiction:SG, Word, rikvin, employment-pass, immigration]
status: draft
template_id: sg-incorp
resource: references/examples/incorp-sg-rikvin-Employment_Pass_Application.docx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T12:45:00Z
sources:
  - id: extraction
    resource: references/extractions/incorp-sg-employment-pass/spine.md
    title: Layer 1 spine extraction
---

# Reference: Rikvin Employment Pass (SG)

## Format

| Field | Value |
|-------|-------|
| Region | SG |
| BU | In.Corp / Rikvin |
| Deliverable | Word (legacy In.Corp template + Rikvin footer) |
| Output shell | Not Ascentium brand shell |

## Section spine

Same SG Word envelope through credentials as the cs-ep anchor sample — **immigration-only subset**.

## Fee modules

| Module | Table | Services |
|--------|-------|----------|
| DP Services | tbl[4] | Dependent Pass, LTVP |
| PEP Services | tbl[5] | ONE Pass |
| Other Services | tbl[6] | Education verification (tiered `from {{fee_amount}}`) |

### Fee column pattern

`Services` | `One-off Fee (SGD)` | `Recurring Fee (SGD)` — per-application one-off, recurring usually `-`.

Maps to layout `oneoff-recurring`.

## Rikvin disclaimer pattern

After each immigration fee block: services provided by RIKVIN PTE. LTD. (UEN / EA licence) as independent subsidiary.

## Section Block promotion notes

- Rikvin disclaimer is a strong candidate for `Section Block` once placeholderized
- Shared SG credentials front-matter overlaps CS+EP sample
