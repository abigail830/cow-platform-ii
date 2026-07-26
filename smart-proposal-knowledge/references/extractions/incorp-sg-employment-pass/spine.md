---
type: Extraction Spine
title: "Layer 1 spine — incorp-sg-employment-pass"
description: PII-redacted section index from office ingest (Layer 1 staging).
status: draft
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T12:00:00Z
sources:
  - id: reference-proposal
    resource: examples/incorp-sg-rikvin-employment-pass.md
    title: InCorp SG — Rikvin Employment Pass Application
  - id: binary
    resource: references/examples/incorp-sg-rikvin-Employment_Pass_Application.docx
    title: Original sample document
---

# Spine (PII-redacted)

Source: `incorp-sg-rikvin-Employment_Pass_Application.docx`

## Document stats

- 187 paragraphs, 6 tables, 41 images
- Footer: incorp.asia + RIKVIN UEN / EA licence
- Format: Word (In.Corp legacy template — Rikvin immigration track)

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
| 10 | FEES |
| 11 | Terms & Conditions (+ subsections) |

## Scope modules (FEES)

1. **DP Services** — tbl[4]: Dependent Pass, LTVP applications
2. **PEP Services** — tbl[5]: ONE Pass application
3. **Other Services** — tbl[6]: Education verification (country-tiered `from {{fee_amount}}`)

Each immigration block followed by Rikvin subsidiary disclaimer (UEN / EA licence).

## Fee table pattern

| Services | One-off Fee (SGD) | Recurring Fee (SGD) |

Per-application one-off pricing; typically no recurring column.

Maps to [oneoff-recurring](/layouts/oneoff-recurring.md).

## Section Block candidates

- Shared SG Word front-matter (About → Accreditations)
- Rikvin disclaimer paragraph (repeat after each immigration fee block)
- Terms & Conditions cluster
