# Word brand shell — zone map (Layer 1)

Source: `references/templates/ascentium-word-brand-shell.docx`  
Extractor: `officecli view text` + `query p` (2026-07-26)

## Page zones

| Zone | paraId | Signals | Agent action |
|------|--------|---------|--------------|
| Cover background | `00EDE8E5` | Full-page image (20.9×29.7 cm, behind text) | Leave as-is |
| Cover title slots | `6896C053`, `7A5D3034` | `{{proposal_title}}`, `{{proposal_date}}` | `merge` |
| Credentials / offerings art | `340ADF8B` | 4 decorative images + page break at end | **Do not add proposal body here** |
| **Body insert zone** | *(before)* `202EA4F9` | Empty — all proposal sections stack here | `add … --before /body/p[@paraId=202EA4F9]` |
| Back-cover art | `202EA4F9` | `pageBreakBefore=true` + full-page image | **Sealed — never insert after** |
| Close heading | `3CBF0169` | Static `CONTACT US` (#FF6816, 30pt) | Leave as-is |
| Contact merge fields | `7D32076F`, `035430D4`, `4FE1E019` | `{{our_contact_name}}`, `{{our_contact_title}}`, `{{our_contact_number}}` | `merge` |
| Footer URL | `275F09EF` | `https://www.ascentium.com` | Leave as-is |

## Merge keys (observed in file)

| Key | Location |
|-----|----------|
| `proposal_title` | Cover |
| `proposal_date` | Cover |
| `our_contact_name` | Back cover |
| `our_contact_title` | Back cover |
| `our_contact_number` | Back cover |

> Legacy flexon docs use `contact_name` / `contact_title` / `contact_number` — this shell file uses `our_contact_*`. Map at merge time.

## Body typography defaults (for `add`)

| Prop | Value |
|------|-------|
| `font` | Poppins |
| `size` | 11pt body, 16pt major headings |
| `lineSpacing` | 1.0x, `lineRule=auto` |
| `spaceAfter` | 6pt |
| `pageBreakBefore` | true on major chapter headings **except** the first body chapter |

## Table width

Printable body width ≈ **8800 twips**. Example 3-col: `2200,3200,3400`.

## Deprecated anchors (do not use)

`52E883DC`, `4676E560` — see `ascentium-word-brand-shell.anchors.json`.
