# PII redaction & extract rules

Applies to Layer 1 staging, Reference Proposal concepts, and Section Block promotion.

## Reference Proposal (`examples/`)

**Structure only** — never paste sample paragraph text.

| Extract into concept | Examples |
|---------------------|----------|
| Section order / H1 spine | Executive Summary → Scope → Fees → T&Cs |
| Fee **table shape** | Column names, module count, footnote markers |
| Region-specific **module structure** | AU payment options, PH SLA blocks, audit deck rhythm |
| `layout_id` | Plain text in spine (e.g. `` `multi-frequency` ``) — not markdown links to `layouts/` |
| Block **candidates** | By name in promotion notes — wire via template `sections[]`, not example links |
| `template_id` | Frontmatter when mapped — catalog row in `examples/index.md` only |

Do **not** add `Cross-links` sections pointing at templates or sibling examples — see [linking-policy.md](linking-policy.md).

Shell zones (brand ingest only): cover, credentials art, body insert paraId, sealed back cover — document on `Output Shell` concept, not in proposal examples.

`resource: references/examples/{file}.docx` — binary stays in `references/`.

## Section Block (`blocks/`)

**Prose comes from Layer 1 `text.txt` only** — see [example-to-block-pipeline.md](example-to-block-pipeline.md).

| Do | Don't |
|----|-------|
| Copy verbatim lines from `text.txt`, then placeholderize PII | Copy from legacy composer markdown |
| Cite `sources` → `references/extractions/{slug}/text.txt` with line numbers | Paraphrase or “improve” wording |
| Use `render: visual_pending` when spine has heading but `text.txt` has no body | Invent locations tables, stats, accreditation lists |
| Set `generated.by: process:office-extract/v1` | Set `verified` until human review |

### Image-only credentials pages

When `outline.json` reports images and `text.txt` has headings only (Snapshot, Locations, Accreditations):

- Create a `visual_pending` block documenting the spine table.
- Export path: future `references/ux/` assets or template `export` shell zone — do not link shell concepts from block body.
- **Never** fill with text transcribed from other documents.

## PII replacement

| Forbidden in concepts | Replace with |
|----------------------|--------------|
| Client / company names | `{{client.company_name}}` |
| Contact / addressee names | `{{client.contact_name}}` |
| Emails / phones | `{{contact_email}}`, `{{contact_phone}}` |
| Dates | `{{proposal_date}}` |
| Fee amounts / deal numbers | omit — fees live in catalog/materializer, not blocks |
| Client addresses | omit or `{{client.address}}` |
| Our signatory names/titles | `{{our_contact.name}}`, `{{our_contact.title}}` |

## Promotion gate (Section Block → `stable`)

- Pattern confirmed against anchor example extraction (not composer alone).
- Body fully placeholderized.
- `sources` cite in-bundle extraction only.
- Human sets `verified: human:<id>`.

## Cross-sample dedup

Before promoting shared boilerplate (e.g. SG T&Cs):

- Confirm identical or near-identical lines in multiple `text.txt` files.
- One block under `blocks/{bu}/regions/{region}/` or `shared/`.
- Do not merge if anchor examples materially differ — keep region-specific blocks.
