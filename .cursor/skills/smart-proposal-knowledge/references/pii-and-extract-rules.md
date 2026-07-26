# PII redaction & extract rules

Applies to all Layer 1 staging and Reference Proposal / Section Block concepts.

## Extract into concepts

| Extract | Examples |
|---------|----------|
| Section order / H1 spine | Executive Summary → Scope → Fees → T&Cs |
| Static boilerplate structure | About, snapshot, accreditations (rephrase; no legacy dual-brand unless asked) |
| Fee **table shape** | Column names, setup vs annual, option rows |
| Region-specific **module structure** | AU payment options, PH SLA blocks, audit deck rhythm |
| Shell zones & anchors | Cover, credentials art, body insert paraId, sealed back cover |

## Do not copy

| Forbidden | Replace with |
|-----------|--------------|
| Client / company names | `{{client.company_name}}` |
| Contact names | `{{contact_name}}` |
| Emails / phones | `{{contact_email}}`, `{{contact_phone}}` |
| Dates | `{{proposal_date}}` |
| Fee amounts / deal numbers | `{{fee_amount}}` or `[REDACTED]` |
| Addresses | `{{client.address}}` |
| Firm-specific legalese verbatim | Summarize pattern only |

## Reference proposal body

- Record **structure** (spine table, fee pattern, links to layouts).
- Link to original: `resource: references/examples/{file}.docx`
- Never paste sample paragraph text that contains PII or exact fees.

## Section Block promotion

Promote boilerplate to `Section Block` only when:
- Pattern appears across multiple reference proposals for the same region/service.
- Body is fully placeholderized.
- Human sets `verified` before `status: stable`.
