---
type: Reference Proposal
title: "Ascentium VN — Services Template (zh-CN)"
description: >-
  Simplified Chinese Vietnam services PPT template with merge placeholders
  for client, services, fees, and appendix tables. Shell-oriented sample.
tags: [incorp, region:VN, jurisdiction:VN, PPT, zh-CN, template]
status: draft
template_id: vn-incorp
reference_role: locale
locale: zh-CN
content_mode: placeholder
resource: references/examples/incorp-vn-services.zh-CN.pptx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T13:00:00Z
sources:
  - id: extraction
    resource: references/extractions/incorp-vn-services-zh-cn/spine.md
    title: Layer 1 slide spine extraction

---

# Reference: Ascentium VN Services Template (zh-CN)

Layer 1 extraction: [extraction spine](/references/extractions/incorp-vn-services-zh-cn/spine.md).


## Format

| Field | Value |
|-------|-------|
| Region | VN |
| BU | Ascentium |
| Deliverable | PPT (10 slides) |
| Language | **zh-CN** |

## Slide spine

| # | Section |
|---|---------|
| 1 | `[[client_company_name]]` - 专业服务提案 |
| 2 | 创始管理层 |
| 3–6 | 品牌介绍 / 集团成员 / 网络 / 服务项目 |
| 7 | 服务方案 – 越南有限责任公司 — **placeholder fee table** |
| 8–9 | Appendix (`[[appendix_*]]` placeholders) |
| 10 | 联系我们 — `[[user_email]]`, `[[user_mobile]]` |

## Placeholder pattern (slide 7)

| Field | Placeholder |
|-------|-------------|
| Package | `[[solution_package_name]]` |
| Service | `[[service_name]]` |
| Scope | `[[scope_of_work]]` |
| Frequency | `[[billing_frequency]]` |
| Fee | `[[service_fee]]` |

## Role

**Locale reference** for `vn-incorp` — zh-CN placeholder PPT shell (`[[merge]]` rows). Canonical filled fees: anchor `incorp-vn-cs-tax-payroll-tax-hr`. See [locale references](/meta/locale-references.md).
