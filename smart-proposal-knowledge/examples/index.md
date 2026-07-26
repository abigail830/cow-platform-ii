# Examples

[Reference Proposal](/meta/type-vocabulary.md) structural indexes — one concept per sample docx/pptx. No PII or fee figures in bodies.

Each sample maps to a `template_id` (anchor or special) or is **unmapped** (Phase 2+). Machine routing: `template_id` on each concept's frontmatter.

## Template anchors (generic)

| Example | `template_id` | Notes |
|---------|---------------|-------|
| [CS + EP + Accounting / Payroll / Tax (SG)](incorp-sg-cs-ep-accounting-payroll-tax.md) | `sg-incorp` | CS, EP, tax, accounting, payroll |
| [Rikvin Employment Pass (SG)](incorp-sg-rikvin-employment-pass.md) | `sg-incorp` | Immigration-only subset |
| [Incorporation (AU)](incorp-au-incorporation.md) | `au-advisory` | |
| [Corporate Secretarial (PH)](incorp-ph-cs.md) | `ph-cs` | |
| [VN CS / Tax / Payroll / HR (PPT)](incorp-vn-cs-tax-payroll-tax-hr.md) | `vn-services` | |
| [BVI All Options](harneys-uk-bvi-all-options.md) | `harneys-uk` | Entity jurisdiction BVI |
| [Cayman All Options](harneys-uk-cayman-all-options.md) | `harneys-uk` | Entity jurisdiction Cayman |
| [HK Incorporation Rates](harneys-hk-incorporation.md) | `harneys-hk` | |

## Special (own template)

| Example | `template_id` | Why special |
|---------|---------------|-------------|
| [Internal Audit Services (SG PPT)](incorp-sg-internal-audit.md) | `sg-audit` | RA / audit deck, not Word proposal |
| [Audit & Assurance (AU PPT)](incorp-au-audit.md) | `au-audit` | Audit deck |
| [Recruitment & Executive Search (PH)](incorp-ph-recruitment.md) | `ph-recruitment` | ITS recruitment — not `ph-cs` |

## Unmapped (Phase 2+)

### InCorp HK / VN

* Word — [Ascentium HK Listed Co CS (zh-CN)](incorp-hk-cs-zh-cn.md)
* PPT — [VN Services Template (zh-CN)](incorp-vn-services-zh-cn.md) — shares `vn-services` spine

Originals: `references/examples/`. Layer 1 staging: `references/extractions/`. PII rules: [type-vocabulary](/meta/type-vocabulary.md).
