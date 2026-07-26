# OKF linking policy (smart-proposal-knowledge)

Aligns with [SPEC.md](../../../../SPEC.md) §5.1 (lineage via `sources`), §6.1 (graph edges via markdown links), and §8 (`index.md` = progressive disclosure). **Goal:** each relationship declared once — machine fields in frontmatter, OKF graph edges in one authoritative place, domain prose in leaf bodies.

## Authority table (where each edge lives)

| Relationship | Authoritative location | Machine field | OKF graph edge |
|--------------|------------------------|---------------|----------------|
| example → `template_id` | [examples/index.md](../../../../smart-proposal-knowledge/examples/index.md) | `template_id` on Reference Proposal frontmatter | Index row links example + [`template`](/templates/{id}.md) |
| template catalog | [templates/index.md](../../../../smart-proposal-knowledge/templates/index.md) | `template_id` in filename + frontmatter | Index row links template |
| template → anchor example | Template `sources[].resource` | `anchor_example` / `anchor_examples` | Template `## Composition` anchor link **or** `sources` (§5.1) |
| template → blocks | Template `sections[]` | `sections[].block` | Template `## Composition` one-way links (§6.1) |
| template → layout | Template frontmatter | `default_layout` or `sections[].layout` | Template `## Composition` link + layout `## Templates using this layout` |
| block → extraction spine | Block `sources` (spine) + body link for `visual_pending` | `sources[].resource` → `spine.md` | Block body link to `/references/extractions/{slug}/spine.md` |
| output shell → zone map | Output Shell `sources` + body lineage line | `sources[].resource` → `zones.md` / `slides.md` | Shell body link; zone map links back to `/brand/...-shell.md` |
| example → extraction spine | Example `sources` + body lineage line | `sources[].resource` → `spine.md` | Example body: `Layer 1 extraction: [spine](...)` |
| template → export shell | Template frontmatter | `export.word.shell` / `export.pptx.shell` | `## Composition` link to `/brand/...` |
| region → default layout + template | [meta/region-routing.md](../../../../smart-proposal-knowledge/meta/region-routing.md) | `layout_id` / `template_id` as **plain text** in table cells | — |
| block → extraction | Block frontmatter only | `sources[].resource` → `references/extractions/{slug}/text.txt` | — (non-concept path) |
| block inventory | [blocks/index.md](../../../../smart-proposal-knowledge/blocks/index.md) | Group by **path tree** (`incorp/regions/sg/`), not by template | Index lists block concepts |

`templates/index.md` may link to `examples/index.md` **once** (one-way). Do not duplicate the example↔template table there.

## `## Composition` (OKF §6.1)

Every draft **Proposal Template** body includes a `## Composition` section:

- Bullet list of **one-way** bundle-relative links (`/blocks/...`, `/layouts/...`, `/brand/...`, anchor example)
- No spine table, no fee-module tables — links only
- Optional blocks marked `(optional)` in link text
- Machine compose contract remains frontmatter `sections[]`; agents read YAML first

## Do not (token waste + crawl loops)

| Anti-pattern | Instead |
|--------------|---------|
| Anchor example column in `templates/index.md` | Read `examples/index.md` or `template_id` / `anchor_example` frontmatter |
| Example links in `region-routing.md` | `template_id` text + pointer sentence to examples index |
| Example lists at end of `layouts/*.md` | Layout `sources` → binary in `references/examples/` for provenance only |
| Spine ↔ section **table** duplicating `sections[]` in template body | `sections[]` YAML + `## Composition` link list |
| `Cross-links` / `See also` between example and template concepts | `template_id` frontmatter + examples index row |
| Example body links to `templates/` | examples index + template `sources` / `## Composition` |
| Block body links to template or Output Shell | Shell in template `export`; block cites extraction only |
| Block body links back to template (reverse of Composition) | One-way template → block only |
| `layout_id` as markdown link in example body | Plain text: `` `oneoff-recurring` `` |
| Separate template per language | `template_id` + `reference_role: locale` + `locale` on Reference Proposal |
| Bundle index linking to `.cursor/skills/...` | Skill is outside the bundle; cite bundle `meta/type-vocabulary.md` |

## Agent read order (minimal tokens)

```text
1. examples/index.md OR Reference Proposal.template_id
2. templates/{template_id}.md frontmatter (sections[], anchor_example, export)
3. blocks/{path}.md on demand (sources → text.txt)
```

Skip on routine compose: template body prose (including `## Composition`), `blocks/index.md` (unless discovering paths), `region-routing` example columns.

## When creating or editing concepts

**Reference Proposal (`examples/{name}.md`)**

- Set `template_id` when mapped (omit when unmapped).
- Body: spine, fee pattern, block **candidates** — structure only.
- No links to `templates/`, no `Cross-links` section to templates.

**Proposal Template (`templates/{id}.md`)**

- Set `anchor_example` (or `anchor_examples`) in frontmatter.
- Set `sources[].resource` → anchor example `.md` (§5.1 lineage).
- Body: exceptions + **`## Composition`** link list (§6.1).
- Do **not** add anchor spine tables or duplicate `sections[]` tables.

**Section Block (`blocks/...`)**

- `sources` → in-bundle extraction paths only.
- No template links; optional `tags` may include `template:sg-incorp` for filter only.

**Index files (`*/index.md`)**

- No frontmatter (OKF §8).
- Short descriptions; enumerate children — `template_id` column SHOULD link to `/templates/{id}.md`.

## Locale / multilingual samples

Bundle: [locale-references.md](../../../../smart-proposal-knowledge/meta/locale-references.md).

- One `template_id` per product; extra languages → `reference_role: locale` on Reference Proposal
- `anchor_example` on template → **filled** anchor only
- Locale rows: `examples/index.md` § Locale references (not Unmapped)
- `locale: bilingual` when both languages live in one file (e.g. `harneys-hk`)
- `content_mode: placeholder` — shell / `[[merge]]` study; blocks promote from anchor extraction
