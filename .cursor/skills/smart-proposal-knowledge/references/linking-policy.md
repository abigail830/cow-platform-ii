# OKF linking policy (smart-proposal-knowledge)

Aligns with [SPEC.md](../../../../SPEC.md) §6 (directed edges) and §8 (`index.md` = progressive disclosure). **Goal:** each relationship declared once — machine fields in frontmatter, navigation in indexes, domain prose in leaf bodies.

## Authority table (where each edge lives)

| Relationship | Authoritative location | Machine field |
|--------------|------------------------|---------------|
| example → `template_id` | [examples/index.md](../../../../smart-proposal-knowledge/examples/index.md) | `template_id` on Reference Proposal frontmatter |
| template catalog | [templates/index.md](../../../../smart-proposal-knowledge/templates/index.md) | `template_id` in filename + frontmatter |
| template → anchor example | Template frontmatter only | `anchor_example: examples/{name}.md` |
| template → blocks | Template frontmatter only | `sections[].block` |
| template → layout | Template frontmatter | `default_layout` or `sections[].layout` |
| template → export shell | Template frontmatter | `export.word.shell` / `export.pptx.shell` |
| region → default layout + template | [meta/region-routing.md](../../../../smart-proposal-knowledge/meta/region-routing.md) | `layout_id` / `template_id` as **plain text** in table cells |
| block → extraction | Block frontmatter only | `sources[].resource` → `references/extractions/{slug}/text.txt` |
| block inventory | [blocks/index.md](../../../../smart-proposal-knowledge/blocks/index.md) | Group by **path tree** (`incorp/regions/sg/`), not by template |

`templates/index.md` may link to `examples/index.md` **once** (one-way). Do not duplicate the example↔template table there.

## Do not (token waste + crawl loops)

| Anti-pattern | Instead |
|--------------|---------|
| Anchor example column in `templates/index.md` | Read `examples/index.md` or `template_id` / `anchor_example` frontmatter |
| Example links in `region-routing.md` | `template_id` text + pointer sentence to examples index |
| Example lists at end of `layouts/*.md` | Layout `sources` → binary in `references/examples/` for provenance only |
| Spine ↔ section table in template **body** | `sections[]` YAML is the contract |
| `Cross-links` / `See also` between example and template concepts | `template_id` frontmatter + examples index row |
| Example ↔ example markdown links for subset/compare | One-line note in `examples/index.md` Notes column |
| Block body links to template or Output Shell | Shell in template `export`; block cites extraction only |
| `layout_id` as markdown link in example body | Plain text: `` `oneoff-recurring` `` |
| Bundle index linking to `.cursor/skills/...` | Skill is outside the bundle; cite bundle `meta/type-vocabulary.md` |

## Agent read order (minimal tokens)

```text
1. examples/index.md OR Reference Proposal.template_id
2. templates/{template_id}.md frontmatter (sections[], anchor_example, export)
3. blocks/{path}.md on demand (sources → text.txt)
```

Skip on routine compose: template body prose, `blocks/index.md` (unless discovering paths), `region-routing` example columns.

## When creating or editing concepts

**Reference Proposal (`examples/{name}.md`)**

- Set `template_id` when mapped (omit when unmapped).
- Body: spine, fee pattern, block **candidates** — structure only.
- No links to `templates/`, no `Cross-links` section to templates.

**Proposal Template (`templates/{id}.md`)**

- Set `anchor_example` in frontmatter.
- Body: exceptions only (e.g. "not sg-audit", Rikvin `optional_blocks` behavior).
- Do **not** add anchor spine tables or example markdown links.

**Section Block (`blocks/...`)**

- `sources` → in-bundle extraction paths only.
- No template links; optional `tags` may include `template:sg-incorp` for filter only.

**Index files (`*/index.md`)**

- No frontmatter (OKF §8).
- Short descriptions; enumerate children — not a second copy of frontmatter tables.
