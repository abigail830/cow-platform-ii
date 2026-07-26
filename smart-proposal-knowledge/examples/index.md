# Examples

[Reference Proposal](/meta/type-vocabulary.md) structural indexes — one concept per sample docx/pptx. No PII or fee figures in bodies.

Each sample is either a **template anchor** (generic spine for a [Proposal Template](/templates/index.md)) or a **special** variant (audit PPT, rates schedule, etc.).

## Template anchors (generic)

| Example | → Template |
|---------|------------|
| [CS + EP + Accounting / Payroll / Tax (SG)](incorp-sg-cs-ep-accounting-payroll-tax.md) | `sg-incorp` — CS, EP, tax, accounting, payroll |
| [Rikvin Employment Pass (SG)](incorp-sg-rikvin-employment-pass.md) | `sg-incorp` subset (immigration-only) |
| [Incorporation (AU)](incorp-au-incorporation.md) | `au-advisory` |
| [BVI All Options](harneys-uk-bvi-all-options.md) | `harneys-bvi` |
| [Cayman All Options](harneys-uk-cayman-all-options.md) | `harneys-cayman` (~same spine as BVI) |

## Special (own template)

| Example | → Template | Why special |
|---------|------------|-------------|
| [Internal Audit Services (SG PPT)](incorp-sg-internal-audit.md) | `sg-audit` | RA / audit deck, not Word proposal |
| [Audit & Assurance (AU PPT)](incorp-au-audit.md) | `au-audit` | Audit deck |
| [HK Incorporation Rates](harneys-hk-incorporation.md) | `harneys-hk` | Bilingual rates schedule — not UK options letter |

## Unmapped (Phase 2+)

### InCorp PH

* Word — [Corporate Secretarial](incorp-ph-cs.md)
* Word — [Recruitment & Executive Search](incorp-ph-recruitment.md)

### InCorp HK / VN

* Word — [Ascentium HK Listed Co CS (zh-CN)](incorp-hk-cs-zh-cn.md)
* PPT — [VN CS / Tax / Payroll / HR](incorp-vn-cs-tax-payroll-tax-hr.md)
* PPT — [VN Services Template (zh-CN)](incorp-vn-services-zh-cn.md)

Originals: `references/examples/`. Layer 1 staging: `references/extractions/`.

See [template catalog](/templates/index.md), [PII rules](/meta/type-vocabulary.md), and project skill `pii-and-extract-rules.md`.
