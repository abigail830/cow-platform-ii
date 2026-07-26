---
type: Extraction Spine
title: "Layer 1 spine — incorp-ph-cs-payroll-bookkeeping-ep"
description: PII-redacted section index from office ingest (Layer 1 staging).
status: draft
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T23:40:00Z
sources:
  - id: reference-proposal
    resource: examples/incorp-ph-cs-payroll-bookkeeping-ep.md
    title: InCorp PH — CS / Payroll / Bookkeeping / EP
  - id: binary
    resource: references/examples/incorp-ph-CS-payroll-bookkeeping-ep.docx
    title: Original sample document
---

# Spine (PII-redacted)

Source: `incorp-ph-CS-payroll-bookkeeping-ep.docx`

## Stats

395 paragraphs, 10 tables, 35 images. In.Corp PH template.

## Section spine

1. Cover + TOC + credentials (About → Accreditations)
2. RE: FEE PROPOSAL letter
3. **SERVICES AND FEES** — four fee modules:
   - INCORPORATION AND POST-COMPLIANCE — tbl[4] (Monthly / Annually / One-off / **Total**)
   - PAYROLL SERVICES — tbl[5]
   - GENERAL BOOKKEEPING AND TAX COMPLIANCE — tbl[6]
   - IMMIGRANT VISA – PERMANENT RESIDENT VISA — tbl[7] (One-off / Total)
4. **SERVICE SLAs** — tbl[8] work-product SLA matrix; DEPOSIT FOR EXPENSES; REFUND POLICY — tbl[9]
5. **CORPORATE SECRETARIAL AND RESIDENT Agent SERVICES** — scope / exclusions / terms / indemnity
6. **Corporate Treasurer Service** — post-incorporation officer scope
7. **Nominee Director Service**
8. **GENERAL BOOKKEEPING AND TAX COMPLIANCE** — terms A–F
9. **PAYROLL SERVICES** — scope + terms; payroll schedule tbl[10]
10. **IMMIGRATION** — scope / exclusions
11. **UNIFIED TERMS AND CONDITIONS** — pre-termination / freezework / data privacy / governing law

## Fee pattern

PHP. Layout `multi-frequency` with optional **Total** column.

| Module | Table | Rows | Total column |
|--------|-------|------|--------------|
| Incorporation and post-compliance | tbl[4] | 13 | Yes |
| Payroll | tbl[5] | 6 | Yes |
| Bookkeeping and tax | tbl[6] | 7 | Yes |
| Immigrant visa | tbl[7] | 2 | Yes (one-off only) |

Total column rollup validated by [fee-table-total-column](/computations/fee-table-total-column.md).

## Section Block candidates

SERVICE SLAs (tbl[8] + deposit + refund), CS scope/exclusions/terms, corporate treasurer, nominee director, bookkeeping terms, payroll scope/terms, immigration scope/exclusions, unified T&Cs

## Notes

Supersedes `incorp-ph-cs` anchor — adds payroll, bookkeeping, EP fee modules and full SERVICE SLAs body.
