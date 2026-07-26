---
type: Reference
title: Locale references
description: >-
  How to register multilingual and placeholder-shell Reference Proposals without
  forking templates. One template_id per product spine; locale samples are extra
  references only.
tags: [meta, locale, i18n, examples]
status: stable
generated:
  by: human:qianping
  at: 2026-07-26T22:35:00Z
---

# Locale references

One **Proposal Template** per product spine. Language variants are extra **Reference Proposal** concepts — not Unmapped, not separate templates.

## Frontmatter

| Field | When | Values |
|-------|------|--------|
| `template_id` | Always (when mapped) | Same as anchor — e.g. `vn-services` |
| `reference_role` | Non-anchor samples | `locale` (omit on anchor = default anchor) |
| `locale` | Language of this file | `zh-CN`, `en`, `bilingual`, … |
| `content_mode` | Optional | `filled` (default), `placeholder` (`[[merge]]` shell study) |

Template `anchor_example` always points to the **primary anchor** (usually `content_mode: filled`). Locale rows live only in [examples/index.md](/examples/index.md#locale-references-same-template).

## Three patterns

| Pattern | Example | Blocks |
|---------|---------|--------|
| **Anchor in locale X** | `hk-incorp` anchor is zh-CN | Promote blocks from anchor extraction; `locale` tags which language this anchor uses |
| **Locale reference** | `vn-services` + zh-CN placeholder PPT | Same `sections[]` as template; compose picks block text by `locale` at runtime (future) or separate block paths per locale when promoted |
| **Bilingual single file** | `harneys-hk` EN + zh-CN in one docx | One block per section; body contains both languages |

## Do not

- Create `vn-services-zh-cn` template_id — use `vn-services` + `reference_role: locale`
- List locale samples under Unmapped when `template_id` is known
- Duplicate spine tables between anchor and locale concepts — index table is enough
- Promote locale placeholder prose into blocks when anchor `text.txt` has the canonical wording

## Adding a new locale sample

1. Ingest docx/pptx → `references/extractions/{slug}/`
2. Write `examples/{name}.md` with `template_id`, `reference_role: locale`, `locale`
3. Add one row to **Locale references** in `examples/index.md`
4. Promote translated blocks only when anchor extraction lacks that language
