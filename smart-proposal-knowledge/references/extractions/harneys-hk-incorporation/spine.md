---
type: Extraction Spine
title: "Layer 1 spine — harneys-hk-incorporation"
description: PII-redacted section index from office ingest (Layer 1 staging).
status: draft
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T12:00:00Z
sources:
  - id: reference-proposal
    resource: examples/harneys-hk-incorporation.md
    title: Harneys HK — Company Formation & Administration Rates
  - id: binary
    resource: references/examples/harneys-hk-Incorporation.docx
    title: Original sample document
---

# Spine (PII-redacted)

Source: `harneys-hk-Incorporation.docx`

## Stats
207 paragraphs, 19 tables, 5 images. Bilingual EN/ZH. Content control wrapper on cover.

## Document type
Harneys/Ascentium **company formation & administration rates schedule** (HK), not a standard fee letter.

## Structure
| Zone | Content |
|------|---------|
| Cover | COMPANY FORMATION AND ADMINISTRATION RATES / 公司成立及管理费用 / `{{client.company_name}}` |
| Main rates | tbl[1] — 37-row master schedule |
| Footnotes | Foot Notes 脚注, Notes 注 |
| Supporting tables | tbl[2]–tbl[19] — jurisdiction-specific rate blocks |

## Fee pattern
Matrix-style administration rates. **Not** `oneoff-recurring` layout.

## Tags
Harneys, HK, bilingual, rates-schedule
