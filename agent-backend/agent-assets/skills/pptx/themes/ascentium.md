# Ascentium theme (PowerPoint / pptxgenjs)

Standalone brand spec for **Ascentium** decks. Do **not** mix with Inspire colours, fonts, or devices.

**Source:** Brand Guidelines Full Version R1.10 (Nov 2025).

**Default:** use this theme unless the user asks for **inspire**.

## Personality

Professional, confident, clear. One main idea per slide. Clean backgrounds; soft orange tints over harsh full-orange fills.

## Colours (pptxgenjs — no `#` prefix)

| Role | Name | Hex |
|------|------|-----|
| Primary accent / CTA | Vibrant Orange | `FF6611` |
| Primary dark | Midnight Green | `0F1514` |
| Base | White | `FFFFFF` |
| Soft background | Orange 1 | `FFF0E7` |
| Orange tints | Orange 2–4 | `FFD1B8`, `FFA370`, `FF8541` |
| Neutral tints | MG 1–4 | `B7B9B9`, `878A8A`, `575B5B`, `272C2C` |
| Supporting | Teal Green | `077069` |
| Supporting | Sky Blue | `1877F2` |
| Functional | Error Red | `DC3545` |

**Accessible pairings (WCAG AA):** Midnight Green on White; Vibrant Orange on Midnight Green; Midnight Green on Orange 1.

**Owning Orange:** prefer `FFF0E7` / `FFD1B8` for backgrounds; use `FF6611` for CTAs and highlights, not full-slide orange.

## Typography (PowerPoint font names)

| Element | Font | Weight | Size (pt) |
|---------|------|--------|-----------|
| Slide title | Poppins | Bold (600) | 40–44 |
| Section header | Poppins | Bold (600) | 22–24 |
| Body | Poppins | Regular (400) | 14–16 |
| Emphasis in body | Poppins | Medium (500) | 14–16 |
| Tagline / label | Poppins | Medium (500) | 12–14 |
| Chinese body | Noto Sans SC | Regular | 14–16 |

If Poppins is not available on the target machine, fall back to **Calibri** (body) and **Cambria** (titles) while keeping the Ascentium palette.

## Slide patterns

| Slide type | Background | Title colour | Body colour | Notes |
|------------|------------|--------------|-------------|-------|
| Hero / title | `0F1514` | `FFFFFF` | `FFFFFF` or `B7B9B9` | Optional orange accent shape (`FF6611`) — upward growth motif, not a full-width bar |
| Content | `FFFFFF` | `0F1514` | `0F1514` | MG neutrals for secondary text |
| Soft section | `FFF0E7` | `0F1514` | `0F1514` | Section dividers |
| Closing / CTA | `0F1514` or `FFF0E7` | contrast per row | CTA text/button colour `FF6611` on dark |

**Avoid:** decorative header/footer colour bars, vertical sidebar stripes, accent lines under titles, cream/beige defaults (`F5F5DC`, etc.).

## pptxgenjs palette object

```javascript
const ASCENTIUM = {
  vibrantOrange: 'FF6611',
  midnightGreen: '0F1514',
  white: 'FFFFFF',
  orange1: 'FFF0E7',
  orange2: 'FFD1B8',
  orange3: 'FFA370',
  orange4: 'FF8541',
  mg1: 'B7B9B9',
  mg2: '878A8A',
  mg3: '575B5B',
  mg4: '272C2C',
  tealGreen: '077069',
  skyBlue: '1877F2',
  errorRed: 'DC3545',
  chartColors: ['FF6611', '077069', '1877F2', 'FFA370', '575B5B'],
  fontTitle: 'Poppins',
  fontBody: 'Poppins',
  fontCjk: 'Noto Sans SC',
};
```

## Minimal title + content example

Use a **`.js` file with `require()`** and an **async IIFE** — `writeFile()` returns a Promise; bare top-level `await` fails or exits before the file is written.

```javascript
const pptxgen = require('pptxgenjs');
const C = ASCENTIUM;

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9'; // exact string — lowercase x9, not LAYOUT_16X9

  const title = pres.addSlide();
  title.background = { color: C.midnightGreen };
  title.addText('Presentation title', {
    x: 0.6, y: 1.8, w: 8.8, h: 1.2,
    fontFace: C.fontTitle, fontSize: 40, bold: true, color: C.white, margin: 0,
  });
  title.addText('Subtitle or date', {
    x: 0.6, y: 3.1, w: 8.8, h: 0.5,
    fontFace: C.fontBody, fontSize: 16, color: C.mg1, margin: 0,
  });

  const content = pres.addSlide();
  content.background = { color: C.white };
  content.addText('Section heading', {
    x: 0.5, y: 0.45, w: 9, h: 0.6,
    fontFace: C.fontTitle, fontSize: 28, bold: true, color: C.midnightGreen, margin: 0,
  });
  content.addText([
    { text: 'First point', options: { bullet: true, breakLine: true } },
    { text: 'Second point', options: { bullet: true } },
  ], {
    x: 0.5, y: 1.3, w: 9, h: 3.5,
    fontFace: C.fontBody, fontSize: 16, color: C.midnightGreen,
    paraSpaceAfter: 10, margin: 0,
  });

  await pres.writeFile({ fileName: '/home/user/content-studio/deck.pptx' });
  console.log('PPTX written');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run: `cd /home/user/content-studio && node build-deck.js` (on failure: `node build-deck.js 2>&1`).
