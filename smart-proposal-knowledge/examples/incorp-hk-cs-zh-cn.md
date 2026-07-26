---
type: Reference Proposal
title: "InCorp HK — Corporate Secretarial (zh-CN)"
description: >-
  InCorp Hong Kong Word proposal anchor — company secretarial and compliance.
  This sample is zh-CN and happens to use a listed-company / IPO project context.
tags: [incorp, region:HK, jurisdiction:HK, Word, zh-CN, company-secretary]
status: draft
template_id: hk-incorp
locale: zh-CN
resource: references/examples/incorp-hk-CS.zh-CN.docx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T13:00:00Z
sources:
  - id: extraction
    resource: references/extractions/incorp-hk-cs-zh-cn/spine.md
    title: Layer 1 spine extraction
---

# Reference: InCorp HK Corporate Secretarial (zh-CN)

## Format

| Field | Value |
|-------|-------|
| Region | HK |
| BU | InCorp — Ascentium Corporate Services (HK) |
| Deliverable | Word |
| Language | **zh-CN** (Simplified Chinese) in this anchor sample |

## Section spine

1. Cover — 秘书及合规服务费用提案
2. Proposal letter
3. 皋翊香港介绍 / credentials
4. **项目小组架构** — 项目领导 / 项目经理 / 项目成员 / 服务核心成员
5. Fee tables (tbl[1]–tbl[5])
6. Terms & scope

## Fee pattern

Custom HK fee-table columns — `default_layout: custom` on `hk-incorp` (catalog layout TBD).

## Anchor case note

This file is the **generic InCorp HK** reference. The ingested sample happens to be a **listed-company / IPO** engagement (项目小组、上市服务核心成员) — treat as case context, not a separate product line.

## Language note

Primary content in zh-CN. Use `{{client.company_name}}` / project name placeholders — do not copy sample client text.
