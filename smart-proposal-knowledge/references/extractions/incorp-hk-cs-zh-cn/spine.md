---
type: Extraction Spine
title: "Layer 1 spine — incorp-hk-cs-zh-cn"
description: PII-redacted section index from office ingest (Layer 1 staging).
status: draft
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T12:00:00Z
sources:
  - id: reference-proposal
    resource: examples/incorp-hk-cs-zh-cn.md
    title: InCorp HK — Corporate Secretarial (zh-CN)
  - id: binary
    resource: references/examples/incorp-hk-CS.zh-CN.docx
    title: Original sample document
---

# Spine (PII-redacted)

Source: `incorp-hk-CS.zh-CN.docx`

## Stats
425 paragraphs, 5 tables, 37 images. **Simplified Chinese** — generic InCorp HK CS proposal anchor.

## Section spine (observed)
1. Cover — Ascentium Corporate Services (HK) / `{{project_name}}`
2. 上市公司秘书及合规服务费用提案
3. Proposal letter
4. 皋翊香港介绍 / 团队 / 项目小组架构（项目领导、经理、成员）
5. 服务核心成员（present in this listed-co / IPO case)
6. Fee tables tbl[1]–tbl[5]
7. Terms & scope modules

## Anchor case
This sample happens to be a **listed-company / IPO** engagement — not a separate product line.

## Language
zh-CN primary in this file. Placeholders: `{{client.company_name}}`, `{{project_name}}`.

## Fee pattern
HK CS fee tables — custom columns (`hk-incorp` layout TBD).

## BU
InCorp HK — Ascentium Corporate Services (HK)
