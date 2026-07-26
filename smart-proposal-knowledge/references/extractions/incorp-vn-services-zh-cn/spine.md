---
type: Extraction Spine
title: "Layer 1 spine — incorp-vn-services-zh-cn"
description: PII-redacted section index from office ingest (Layer 1 staging).
status: draft
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T12:00:00Z
sources:
  - id: reference-proposal
    resource: examples/incorp-vn-services-zh-cn.md
    title: Ascentium VN — Services Template (zh-CN)
  - id: binary
    resource: references/examples/incorp-vn-services.zh-CN.pptx
    title: Original sample document
---

# Spine (PII-redacted)

Source: `incorp-vn-services.zh-CN.pptx`

## Stats
10 slides. **zh-CN** template with merge placeholders.

## Slide spine
| # | Section |
|---|---------|
| 1 | `[[client_company_name]]` - 专业服务提案 |
| 2 | 创始管理层 |
| 3–5 | 合作伙伴 / 集团成员 / 全球网络 |
| 6 | 服务项目 |
| 7 | 服务方案 – 越南有限责任公司 — placeholder fee table |
| 8–9 | Appendix slides (`[[appendix_*]]` placeholders) |
| 10 | 联系我们 — `[[user_*]]` |

## Fee pattern
Templated rows: `[[service_name]]`, `[[scope_of_work]]`, `[[billing_frequency]]`, `[[service_fee]]`

## Compare
English counterpart: incorp-vn-cs-tax-payroll-tax-hr (concrete fee schedule). This deck is **template/shell** with placeholders.
