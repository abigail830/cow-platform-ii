# PPT brand shell — slide map (Layer 1)

Source: `references/templates/ascentium-pptx-brand-shell.pptx`  
Extractor: `officecli view text` + `outline` (2026-07-26)

## Slide zones

| # | Role | Marker text | Agent action |
|---|------|-------------|--------------|
| 1 | Title / cover | `{{proposal_title}}`, `{{proposal_date}}`, `PRIVATE & CONFIDENTIAL` | `merge` |
| 2 | Why Partner / KPIs | `Why Partner with Ascentium?` + stat tiles | Keep unless user drops credentials |
| 3 | Global footprint | `Our Global Footprint` + region lists | Keep unless user drops |
| 4 | Service offerings | `Our Service Offerings` + capability grid | Keep or trim on request |
| 5 | **Sealed tail** | `We Are Ascentium` | **Never add proposal body here** |
| 6 | **Contact** | `Contact Us` + merge fields | `merge`; must stay last |

## Merge keys (observed in file)

| Key | Slide |
|-----|-------|
| `proposal_title` | 1 |
| `proposal_date` | 1 |
| `contact_name` | 6 |
| `contact_title` | 6 |
| `contact_email` | 6 |
| `contact_number` | 6 |

## Content insertion

- Insert all proposal content slides **after slide 4** (`--after /slide[4]`, chain as indices shift).
- Use layout **`Clean Slide - White`** — never default cover layout.
- **Never** `--after /slide[5]` or `/slide[6]` on the pristine 6-slide shell.

## Body shape defaults (content slides)

| Element | Props |
|---------|-------|
| Body text | `x=1.5cm y=3.5cm width=22cm height=12cm size=18pt font=Poppins` |
| Table | `x=1.5cm y=3.8cm height=12cm` + `colWidths` in cm (~22cm total) |

## Deprecated

`page_title` content slot removed (Jul 2026 trim). Do not merge body headings via `page_title`.
