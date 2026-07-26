---
name: smart-proposal-knowledge
description: >-
  Smart Proposal OKF bundle domain rules for Ascentium multi-region proposals.
  Use when building or enriching the smart-proposal-knowledge bundle, importing
  Word/PPT reference proposals or brand shells, migrating legacy axon-flow or
  agent-platform assets, or applying PII redaction and type routing for proposal
  concepts. Pair with the okf and docx skills — this skill adds domain vocabulary
  only; OKF authoring uses okf skill, Office parsing uses docx skill.
---

# Smart Proposal Knowledge

Domain layer for the `smart-proposal-knowledge/` OKF bundle in this repo. Spec: [SPEC.md](../../../SPEC.md) (OKF v0.2).

## Companion skills

| Task | Skill |
|------|-------|
| OKF init / add / export / enrich / validate | `okf` (`~/.agents/skills/okf`) |
| Word structure & tables (Layer 1) | `docx` (`~/.agents/skills/docx`) |

## When to load references

| Reference | Use when |
|-----------|----------|
| [type-vocabulary.md](references/type-vocabulary.md) | Choosing `type`, tags, or concept paths |
| [pii-and-extract-rules.md](references/pii-and-extract-rules.md) | Importing from reference docx/pptx |
| [ingest-routing.md](references/ingest-routing.md) | Routing a source file to OKF concept type |
| [legacy-asset-map.md](references/legacy-asset-map.md) | Migrating from axon-flow or agent-platform |

## Two-layer import workflow

1. **Layer 1** — `docx` skill (or OfficeCLI `view outline` / `view text`): extract outline, tables, sections → `smart-proposal-knowledge/references/extractions/{hash}/`. Apply PII rules before staging.
2. **Layer 2** — `okf` skill: `/okf export` or `/okf enrich` staging → concepts under `smart-proposal-knowledge/`. Run `okf-validate.mjs --strict` when available.
3. **Review** — pipeline output defaults to `status: draft`; add `verified: human:<id>` before `stable`.

## Bundle root

All concepts live under `smart-proposal-knowledge/` relative to repo root. Binary originals under `smart-proposal-knowledge/references/`; concepts link via `resource` and `sources`.

## Do not

- Copy client names, dates, fee figures, or PII from reference proposals into concept bodies.
- Treat brand shells as reference proposals (different `type` and extract path).
- Re-implement OKF validation — use the `okf` skill's validator.
