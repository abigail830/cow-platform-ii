---
type: Output Shell
title: Ascentium Word brand shell
description: >-
  Default Word deliverable chrome — cover merge, credentials art page, body
  insert before sealed back cover, CONTACT US close.
tags: [brand, shell, word, ascentium]
status: draft
resource: references/templates/ascentium-word-brand-shell.docx
generated:
  by: process:office-ingest/v1
  at: 2026-07-26T12:30:00Z
sources:
  - id: word-anchors
    resource: references/templates/ascentium-word-brand-shell.anchors.json
    title: Word shell anchor map
  - id: extraction-20260726
    resource: references/extractions/brand-shell-20260726/word/zones.md
    title: Layer 1 zone extraction
---

# Ascentium Word brand shell

Layer 1 extraction: [zone map](/references/extractions/brand-shell-20260726/word/zones.md).

## Purpose

Fallback **output chrome** for Word proposals, letters, fee schedules, and SOWs. The shell carries brand art and merge placeholders only — proposal body is inserted at runtime.

## Zones

| Zone | Anchor | Rule |
|------|--------|------|
| Cover | `proposal_title`, `proposal_date` | Merge on copy |
| Credentials art | After first page break (`340ADF8B`) | Decorative — no body content |
| Body | `--before /body/p[@paraId=202EA4F9]` | All proposal sections stack here |
| Back cover | `202EA4F9` → `3CBF0169` | Sealed tail — never insert after |

## Merge keys

| Key | Notes |
|-----|-------|
| `proposal_title` | Cover |
| `proposal_date` | Cover |
| `our_contact_name` | Back cover (file uses `our_contact_*`, not `contact_*`) |
| `our_contact_title` | Back cover |
| `our_contact_number` | Back cover |

## Body insert command

```text
add <deliverable.docx> /body --type paragraph \
  --prop text=<heading> --prop bold=true --prop size=16pt --prop font=Poppins \
  --before /body/p[@paraId=202EA4F9]
```

First body chapter: no `pageBreakBefore`. Later major chapters: `pageBreakBefore=true`.

## Typography & tables

- Body: Poppins 11pt, `lineSpacing=1.0x`, `spaceAfter=6pt`
- Major headings: 16pt bold
- Table `colWidths` (twips): 3-col `2200,3200,3400`; printable width ≈ 8800 twips

## Deprecated anchors

Do not use `52E883DC` or `4676E560` — see anchors JSON.
