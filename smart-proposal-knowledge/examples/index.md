# Examples

[Reference Proposal](/meta/type-vocabulary.md) structural indexes — one concept per sample docx/pptx. No PII or fee figures in bodies.

Routing: `template_id` + optional `reference_role` / `locale` on each concept's frontmatter. See [locale references](/meta/locale-references.md).

## Template anchors (generic)

Primary spine per `template_id`. Template `anchor_example` points here.

| Example | `template_id` | Notes |
|---------|---------------|-------|
| [CS + EP + Accounting / Payroll / Tax (SG)](incorp-sg-cs-ep-accounting-payroll-tax.md) | `sg-incorp` | CS, EP, tax, accounting, payroll |
| [Rikvin Employment Pass (SG)](incorp-sg-rikvin-employment-pass.md) | `sg-incorp` | Immigration-only subset |
| [Incorporation (AU)](incorp-au-incorporation.md) | `au-advisory` | |
| [Corporate Secretarial (PH)](incorp-ph-cs.md) | `ph-cs` | |
| [Corporate Secretarial (HK, zh-CN)](incorp-hk-cs-zh-cn.md) | `hk-incorp` | `locale: zh-CN`; listed-co case context only |
| [VN CS / Tax / Payroll / HR (PPT)](incorp-vn-cs-tax-payroll-tax-hr.md) | `vn-services` | |
| [BVI All Options](harneys-uk-bvi-all-options.md) | `harneys-uk` | Entity jurisdiction BVI |
| [Cayman All Options](harneys-uk-cayman-all-options.md) | `harneys-uk` | Entity jurisdiction Cayman |
| [HK Incorporation Rates](harneys-hk-incorporation.md) | `harneys-hk` | `locale: bilingual` (EN + zh-CN in one file) |

## Locale references (same template)

Additional language or placeholder-shell samples — **not** a second template. Blocks promote from **anchor** extraction unless a locale file is the only source for that language string.

| Example | `template_id` | `locale` | Notes |
|---------|---------------|----------|-------|
| [VN Services Template (zh-CN)](incorp-vn-services-zh-cn.md) | `vn-services` | `zh-CN` | Placeholder PPT shell (`[[merge]]` rows); anchor has filled fees |

## Special (own template)

| Example | `template_id` | Why special |
|---------|---------------|-------------|
| [Internal Audit Services (SG PPT)](incorp-sg-internal-audit.md) | `sg-audit` | RA / audit deck, not Word proposal |
| [Audit & Assurance (AU PPT)](incorp-au-audit.md) | `au-audit` | Audit deck |
| [Recruitment & Executive Search (PH)](incorp-ph-recruitment.md) | `ph-recruitment` | ITS recruitment — not `ph-cs` |

Originals: `references/examples/`. Layer 1 staging: `references/extractions/`. PII rules: [type-vocabulary](/meta/type-vocabulary.md).
