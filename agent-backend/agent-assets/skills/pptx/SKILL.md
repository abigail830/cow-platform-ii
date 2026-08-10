---
name: pptx
description: "Use this skill any time a .pptx or .potx file is involved — creating slide decks, editing presentations, or reading deck content. Trigger on \"deck,\" \"slides,\" \"presentation,\" or a .pptx / .potx filename."
license: Proprietary. LICENSE.txt has complete terms
---

# PPTX skill

A `.pptx` is a ZIP of XML parts. Pick the path by task:

| Task | Approach |
|------|----------|
| **Create** a new deck | **Node.js + pptxgenjs** (primary) — see [Brand themes](#brand-themes) and [pptxgenjs gotchas](#pptxgenjs-gotchas) |
| **Edit** an existing deck or fill a template | unzip → edit XML or duplicate slides → zip (optional Python helpers) |
| **Read** slide text | `markitdown deck.pptx` |

Paths below are relative to this skill directory unless noted.

## Create new decks (pptxgenjs)

**Workflow**

1. Clarify topic, audience, slide count, and brand theme if missing.
2. **Default theme: `ascentium`** — use `themes/inspire.md` only when the user asks for Inspire.
3. Read the matching theme file for colours, fonts, slide patterns, and the starter `ASCENTIUM` / `INSPIRE` constant object.
4. Write a **Node.js script** (`.js` + `require('pptxgenjs')`) using the **async IIFE** pattern from the theme file — build slides, then **`await pres.writeFile(...)`** inside the IIFE.
5. Run from the workspace: `cd /home/user/content-studio && node your-script.js` — if bash reports `exit status 1` with no message, rerun `node your-script.js 2>&1` to print stderr.
6. **`publish_artifact`** on the final `.pptx` — not intermediate files.

`pptxgenjs` is preinstalled. Do not run `npm install` unless `require('pptxgenjs')` fails.

**Do not** run `validate.py`, LibreOffice PDF conversion, or thumbnail grids for normal create-and-deliver requests. Fix layout and copy in the generator; spot-check with `markitdown` only if you suspect missing text.

## Brand themes

Two **independent** themes. **Never mix** colours, fonts, or graphic devices.

| Theme | Brand | Spec file | When |
|-------|-------|-----------|------|
| **`ascentium`** (default) | Ascentium | `themes/ascentium.md` | Corporate / client Ascentium materials |
| **`inspire`** | Inspire | `themes/inspire.md` | Inspire / Inspire AI materials |

Each theme file includes:

- Hex values for pptxgenjs (`FF6611`, not `#FF6611`)
- PowerPoint font names and sizes
- Slide background / title / body patterns
- `chartColors` array and a minimal pptxgenjs example

Do not invent a third palette unless the user explicitly opts out of brand themes.

## pptxgenjs gotchas

**Script execution (most common source of retries and long runtimes):**

- **`writeFile()` is async.** Always wrap the script in `(async () => { ... await pres.writeFile(...); })().catch(err => { console.error(err); process.exit(1); })`. Never use top-level `await` in a plain `.js` file — Node exits before the file is written or throws syntax errors.
- **Do not call `writeFile()` without `await`** — the process exits immediately and bash returns `exit status 1` with an empty or missing `.pptx`.
- **Layout name is exactly** `'LAYOUT_16x9'` (lowercase `x9`). Not `LAYOUT_16X9`, not `LAYOUT_16:9`. Wide 16:9 is `'LAYOUT_WIDE'`.
- **Run scripts from** `/home/user/content-studio` so output paths and local `node_modules` resolve: `cd /home/user/content-studio && node build.js`.
- **`require('pptxgenjs')`** is preinstalled globally; if it fails, use the copy under `/home/user/content-studio/node_modules/pptxgenjs`.
- On failure, capture stderr: `node build.js 2>&1` — the bash tool may not surface stderr on its own.

**File content:**

- Set **`pres.layout` before adding slides.** `LAYOUT_16x9` is **10" × 5.625"** — coordinates past the edge are clipped, not scaled.
- **Hex colours: never `#`, never 8-digit hex.** Use `color: "FF6611"`. For transparency use `transparency` on fills or `opacity` on shadows.
- **pptxgenjs mutates option objects in place** — build a fresh options object per `addText` / `addShape` call.
- **Shadow `offset` must be ≥ 0** — use `angle: 270` with positive offset for upward shadows.
- **Lists:** `bullet: true` per item; `breakLine: true` on each item except the last; use `paraSpaceAfter`, not huge `lineSpacing`.
- **One `new pptxgen()` per output file.**
- **`rectRadius` only on `ROUNDED_RECTANGLE`.**
- **No gradient fills** — use a gradient image as background if needed.
- **Text boxes:** set `margin: 0` when aligning text with shapes or lines.
- **Speaker notes:** `slide.addNotes("...")`, not a on-slide text box.
- **Charts:** use `addChart()`; set `showTitle`, `dataLabelPosition`, `chartColors` from the active theme. On stacked bar/column, `dataLabelPosition` must be `ctr`, `inEnd`, or `inBase` — **`outEnd` corrupts the file**.
- **Combo charts with secondary axis:** supply both `valAxes` and `catAxes` (two entries each) or PowerPoint may reject the chart.
- **Icons:** rasterize to PNG (e.g. `sharp` at ≥256px) and `addImage({ data: "image/png;base64," + ... })`.

## Design (all themes)

- One main idea per slide; every slide needs a visual (chart, icon, image, or shape) — not bullets-only walls.
- Strong size contrast: titles ~36–44pt, body 14–16pt.
- Left-align body text; centre titles only when appropriate.
- **Avoid:** full-width colour bars, vertical sidebar stripes, accent lines under titles, decorative edge stripes on cards, default beige backgrounds.

## Edit existing decks and templates (optional)

Use when the user supplies a template or asks to modify an existing file — not for typical “generate a new deck” requests.

```bash
python3 -c "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall('unpacked')" deck.pptx
python scripts/add_slide.py unpacked/ slide2.xml --after slide2.xml
# reorder / delete = edit <p:sldIdLst> in ppt/presentation.xml
python scripts/clean.py unpacked/
# edit ppt/slides/slideN.xml (use defusedxml.minidom — not ElementTree)
(cd unpacked && rm -f ../out.pptx && zip -Xr ../out.pptx .)
```

| Script | Purpose |
|--------|---------|
| `scripts/thumbnail.py deck.pptx [prefix]` | Layout picker grid when choosing template slides (optional) |
| `scripts/add_slide.py` | Duplicate slide or layout with correct package bookkeeping |
| `scripts/clean.py` | Remove orphaned slides/media after `<p:sldIdLst>` edits |

- Structural work (add/delete/reorder slides) **before** editing slide content.
- Use `add_slide.py` — do not copy slide XML by hand.
- Legacy `.ppt`: `python scripts/office/soffice.py --headless --convert-to pptx file.ppt`

## Read content

```bash
markitdown deck.pptx
```

Slides appear under `<!-- Slide number: N -->` markers.

## Dependencies

- **Create:** Node.js, `pptxgenjs` (preinstalled)
- **Edit / read:** Python 3, `markitdown[pptx]`, `defusedxml`, `Pillow` (thumbnails/clean)
- **Optional:** LibreOffice via `scripts/office/soffice.py` (legacy `.ppt` conversion only)

## Scripts not in the default workflow

`scripts/office/validate.py`, PDF conversion, and `pdftoppm` remain in the repo for advanced template/OXML work but are **not** required for pptxgenjs create-and-deliver flows.
