# Inspire theme (PowerPoint / pptxgenjs)

Standalone brand spec for **Inspire** decks. **Not Ascentium** — do not use Poppins, Noto Sans SC, orange palette, or Ascentium arrow motifs.

**Source:** Inspire brand guidelines (Colour / Typography / slide templates).

Use when the user asks for **inspire** (or Inspire AI branding).

## Personality

Tech-forward, calm confidence. Creative Blue for emphasis only (~5–10% of slide area). Deep gray body text, not pure black.

## Colours (pptxgenjs — no `#` prefix)

| Role | Name | Hex |
|------|------|-----|
| Primary dark | Starry Blues | `0A2342` |
| Accent | Creative Blue | `34B3E4` |
| Light neutral | Tech Gray | `F0F2F5` |
| Base | White | `FFFFFF` |
| Body text | Deep gray | `333333` |
| Muted | Light gray | `999999` |
| Dark slide bg | Starry layer | `0A1E3C` |
| Auxiliary charts | Amethys | `6964AD` |
| Auxiliary charts | Myrtle Deep Green | `005043` |
| Auxiliary charts | Cerulean Frost | `73AFC2` |
| Auxiliary charts | Sakura Pink | `F5B0BD` |

**Creative Blue:** subtitles on dark slides, CTAs, footer, progress — not large background fills.

## Typography (PowerPoint font names)

| Element | Font | Weight | Size (pt) |
|---------|------|--------|-----------|
| Headlines | MiSans | SemiBold (600) or Medium (500) | 36–44 |
| Subtitles | MiSans | Medium (500) or Light (300) | 20–24 |
| Body | MiSans | Regular (400) or Light (300) | 14–16 |
| Chapter / section titles | Georgia | Regular | 28–36 |

MiSans may not be installed everywhere. Fallback chain: **MiSans → PingFang SC → Microsoft YaHei → Arial**.

Chapter titles on light slides: **Georgia** serif (e.g. `CONTENTS`, section openers).

## Slide patterns

| Slide type | Background | Title | Subtitle / body | Notes |
|------------|------------|-------|-----------------|-------|
| Light content | `FFFFFF` or `F0F2F5` | `0A2342` MiSans | `333333` MiSans | Serif Georgia chapter title top-left optional |
| Dark separator | `0A2342` or `0A1E3C` | `FFFFFF` Georgia or MiSans | `34B3E4` MiSans | Corner bracket accent in `2A3A54` optional |
| Footer | any branded | — | `34B3E4` 10–12pt | Text: `© 2026 Inspire | Confidential` |

**Avoid:** Ascentium orange, Poppins, full-width colour bars, pure black (`000000`) body text.

## pptxgenjs palette object

```javascript
const INSPIRE = {
  starryBlues: '0A2342',
  creativeBlue: '34B3E4',
  techGray: 'F0F2F5',
  white: 'FFFFFF',
  text: '333333',
  textMuted: '999999',
  darkBg: '0A1E3C',
  cornerMuted: '2A3A54',
  amethys: '6964AD',
  myrtleGreen: '005043',
  ceruleanFrost: '73AFC2',
  sakuraPink: 'F5B0BD',
  chartColors: ['34B3E4', '6964AD', '005043', '73AFC2', 'F5B0BD'],
  fontHeadline: 'MiSans',
  fontBody: 'MiSans',
  fontChapter: 'Georgia',
};
```

## Minimal dark separator + content example

Use an **async IIFE** and **await `writeFile()`** — see `themes/ascentium.md` for the required script shell.

```javascript
const pptxgen = require('pptxgenjs');
const C = INSPIRE;

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';

  const opener = pres.addSlide();
  opener.background = { color: C.darkBg };
  opener.addText('Section title', {
    x: 0.6, y: 2.0, w: 8.8, h: 1.0,
    fontFace: C.fontChapter, fontSize: 36, color: C.white, margin: 0,
  });
  opener.addText('Creative Blue subtitle', {
    x: 0.6, y: 3.1, w: 8.8, h: 0.5,
    fontFace: C.fontHeadline, fontSize: 18, color: C.creativeBlue, margin: 0,
  });
  opener.addText('© 2026 Inspire | Confidential', {
    x: 0.6, y: 5.0, w: 8.8, h: 0.35,
    fontFace: C.fontBody, fontSize: 10, color: C.creativeBlue, margin: 0,
  });

  const content = pres.addSlide();
  content.background = { color: C.white };
  content.addText('CONTENTS', {
    x: 0.5, y: 0.4, w: 9, h: 0.55,
    fontFace: C.fontChapter, fontSize: 28, color: C.starryBlues, margin: 0,
  });
  content.addText([
    { text: 'Agenda item one', options: { bullet: true, breakLine: true } },
    { text: 'Agenda item two', options: { bullet: true } },
  ], {
    x: 0.5, y: 1.2, w: 9, h: 3.5,
    fontFace: C.fontBody, fontSize: 16, color: C.text,
    paraSpaceAfter: 10, margin: 0,
  });

  await pres.writeFile({ fileName: '/home/user/content-studio/deck.pptx' });
  console.log('PPTX written');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
```
