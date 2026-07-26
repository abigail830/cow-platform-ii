---
type: Output Shell
title: Ascentium PPT brand shell
description: >-
  Default PowerPoint deliverable chrome — 4 intro slides, content after slide 4,
  sealed We Are Ascentium + Contact tail.
tags: [brand, shell, pptx, ascentium]
status: draft
resource: references/templates/ascentium-pptx-brand-shell.pptx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T12:30:00Z
sources:
  - id: pptx-anchors
    resource: references/templates/ascentium-pptx-brand-shell.anchors.json
    title: PPT shell anchor map
  - id: extraction-20260726
    resource: references/extractions/brand-shell-20260726/pptx/slides.md
    title: Layer 1 slide extraction
---

# Ascentium PPT brand shell

## Purpose

Fallback **output chrome** for pitch decks, audit decks, and service overviews. Intro slides 1–4 are fixed brand content; proposal slides insert after slide 4; slides 5–6 are sealed.

## Slide map

| # | Role | Action |
|---|------|--------|
| 1 | Title | Merge `proposal_title`, `proposal_date` |
| 2 | Why Partner / KPIs | Keep unless user drops |
| 3 | Global footprint | Keep unless user drops |
| 4 | Service offerings | Keep or trim on request |
| 5 | We Are Ascentium | **Sealed** — no proposal body |
| 6 | Contact Us | Merge contact fields; must stay last |

## Merge keys

| Key | Slide |
|-----|-------|
| `proposal_title` | 1 |
| `proposal_date` | 1 |
| `contact_name` | 6 |
| `contact_title` | 6 |
| `contact_email` | 6 |
| `contact_number` | 6 |

## Content insertion

```text
merge references/templates/ascentium-pptx-brand-shell.pptx <out.pptx> --data {...} --force
add <out.pptx> / --type slide --prop layout="Clean Slide - White" --prop title=<chapter> --after /slide[4]
```

Chain `--after /slide[N]` as indices shift. Never `--after /slide[5]` or `/slide[6]` on the pristine 6-slide shell.

## Content slide defaults

| Element | Props |
|---------|-------|
| Body shape | `x=1.5cm y=3.5cm width=22cm height=12cm size=18pt font=Poppins` |
| Table | `x=1.5cm y=3.8cm` + `colWidths` in cm (~22cm total) |

One title per content slide: use `--prop title=` only — do not duplicate with a second title shape.
