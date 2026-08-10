---
name: html-slides
description: Create interactive HTML presentations with reveal.js. Use when the user wants web-based slides, HTML deck, browser presentation, or reveal.js instead of PowerPoint.
license: MIT
metadata:
  source: claude-office-skills/skills
  version: "1.0"
---

# HTML Slides Skill

## Overview

This skill enables creation of stunning HTML-based presentations using **reveal.js** - the web's most popular presentation framework. Create interactive, responsive slides with animations, code highlighting, speaker notes, and more.

## How to Use

1. Clarify topic, audience, and slide count if missing.
2. **Default theme: `ascentium`** — use unless the user asks for `inspire` or a built-in reveal.js theme.
3. Produce a **single self-contained HTML file** (CDN for reveal.js; brand theme CSS from this skill or inlined).
4. Include title slide, agenda, structured sections, and closing slide.
5. Save as `presentation.html` (or a descriptive name) in the workspace.

**Example prompts:**
- "Create an interactive presentation about our product"
- "Build a code walkthrough presentation with syntax highlighting"
- "Make a presentation with speaker notes and timer"
- "Create slides with animations and transitions"

## Brand themes

Two **independent** brand themes ship with this skill. **Never mix** colours, fonts, or graphic devices between them.

| Theme | Brand | CSS file | When to use |
|-------|-------|----------|-------------|
| **`ascentium`** (default) | Ascentium | `themes/ascentium.css` | Ascentium corporate decks, client materials |
| **`inspire`** | Inspire | `themes/inspire.css` | Inspire / Inspire AI presentations |

Copy the chosen theme file beside your HTML or inline its rules.

Do **not** use built-in reveal themes (`white`, `night`, …) unless the user explicitly opts out of brand themes.

### Ascentium theme — visual requirements

Source: *Brand Guidelines Full Version R1.10 (Nov 2025)*.

**Brand personality on slides:** professional, confident, clear; one main idea per slide; clean backgrounds that support the message (not distract).

**Core colours**

| Role | Name | Hex | Usage |
|------|------|-----|--------|
| Primary accent / CTA | Vibrant Orange | `#FF6611` | CTAs ("Learn more", primary actions), highlights, progress bar |
| Primary dark | Midnight Green | `#0F1514` | Headlines, body on light backgrounds, code blocks, table headers |
| Base | White | `#FFFFFF` | Default slide background |
| Soft background | Orange 1 | `#FFF0E7` | Soft-touch orange backgrounds ("Owning Orange" — prefer softer tints, not full orange fills) |
| Orange tints | Orange 2–4 | `#FFD1B8`, `#FFA370`, `#FF8541` | Accents on dark slides, emphasis |
| Neutral tints | MG 1–4 | `#B7B9B9` … `#272C2C` | Secondary text, labels, borders |
| Supporting | Teal Green | `#077069` | Success, secondary emphasis |
| Supporting | Sky Blue | `#1877F2` | Informational callouts |
| Functional | Error Red | `#DC3545` | Errors / warnings only |

**Accessible pairings (WCAG AA):** Midnight Green on White; Vibrant Orange on Midnight Green; Midnight Green on Orange 1.

**Typography**

| Style | Weight | Size (digital) | Line height | Tracking |
|-------|--------|----------------|-------------|----------|
| Headline | Semi-Bold (600) | 48px | 58px | −1% |
| Sub-heading | Semi-Bold (600) | 31px | 38px | 0% |
| Large body | Medium (500) | 20px | 28px | 0% |
| Small body | Regular (400) | 16px | 24px | 0% |
| Tagline / label | Medium (500) | 14px | 18px | 0% |

- **English:** Poppins (`400`, `500`, `600`)
- **Chinese (简/繁):** Noto Sans SC — fallbacks: Arial, Helvetica
- **Headings:** Semi-Bold; **emphasis in body:** Medium weight; **body:** Regular
- Do not substitute other display fonts unless Poppins/Noto Sans unavailable

**Layout & imagery**

- One clear idea per slide; avoid text walls and cluttered backgrounds.
- **Owning Orange:** use soft orange (`#FFF0E7`, `#FFD1B8`) in backgrounds; do not overuse full `#FF6611` or harsh orange fills.
- **Hero / title slide:** Midnight Green background + white text, or white/soft-orange background + Midnight Green text.
- **Graphic device:** optional upward-arrow accent (class `ascentium-arrow` in theme CSS) for growth/progress motifs — do not distort, shadow, or reverse direction.
- Photography (when used): professional workplace or mountain imagery; warm tones; natural lighting; no busy stock clutter.

### Inspire theme — visual requirements

Source: Inspire brand guidelines (Colour / Typography / slide templates). **Not Ascentium** — do not use Poppins, Noto Sans SC, orange palette, or Ascentium arrow device.

**Core colours**

| Role | Name | Hex | Usage |
|------|------|-----|--------|
| Primary dark | Starry Blues 星空蓝 | `#0A2342` | Wisdom, quality; dark slide backgrounds, table headers |
| Accent | Creative Blue 创想蓝 | `#34B3E4` | **Emphasis only** — highlights, subtitles on dark slides, CTAs, footer, progress (~5–10% of area) |
| Light neutral | Tech Gray 科技灰 | `#F0F2F5` | Alternate light backgrounds |
| Base | White 白 | `#FFFFFF` | Default content slide background |
| Text | Deep gray | `#333333` | Body text — **not pure black** (warmer tone per guidelines) |
| Muted | Light gray | `#999999` | Slide numbers, secondary labels |
| Auxiliary | Amethys 紫水晶 | `#6964AD` | Charts, callouts, differentiation |
| Auxiliary | Myrtle Deep Green 冬青绿 | `#005043` | Charts, callouts |
| Auxiliary | Cerulean Frost 蔚蓝霜色 | `#73AFC2` | Charts, callouts |
| Auxiliary | Sakura Pink 樱花粉 | `#F5B0BD` | Charts, callouts |

**Typography — MiSans only** (not Poppins / Noto Sans)

| Role | Weight | Notes |
|------|--------|--------|
| Headlines | SemiBold (600) or Medium (500) | Slide `h1`, `h2` |
| Subtitles | Medium (500) or Light (300) | `h3`, `h4` |
| Body | Regular (400) or Light (300) | Paragraphs, lists |
| Chapter / section titles | Serif (Georgia) | e.g. `CONTENTS`, `Colour 色彩使用` — class `inspire-serif-title` or first `h1` on light slides |

**Layout**

- Light content: white or Tech Gray background; serif chapter title top-left; MiSans body.
- Dark separator / contact: Starry Blues / `#0A1E3C` background; serif white main title; Creative Blue subtitle (`inspire-subtitle`); optional corner bracket accent (`inspire-corner-accent`).
- Footer on branded slides: `© 2026 Inspire | Confidential` in Creative Blue — use class `inspire-footer`.
- Section classes: `inspire-light`, `inspire-tech`, `inspire-dark`, `inspire-corner-accent`.

### Theme skeleton (default: ascentium)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Presentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.css">
  <link rel="stylesheet" href="themes/ascentium.css">
</head>
<body>
  <div class="reveal">
    <div class="slides">
      <section class="ascentium-hero center">
        <h1><span class="ascentium-arrow" aria-hidden="true"></span>Title</h1>
        <p class="tagline">Subtitle or date</p>
      </section>
      <section>
        <h2>Section</h2>
        <ul>
          <li class="fragment">Point one</li>
          <li class="fragment">Point two</li>
        </ul>
      </section>
      <section class="ascentium-soft center">
        <h2>Questions?</h2>
        <p><a class="cta" href="mailto:team@ascentium.com">Contact us</a></p>
      </section>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.js"></script>
  <script>
    Reveal.initialize({ hash: true, slideNumber: true, transition: 'slide' });
  </script>
</body>
</html>
```

For **Inspire**, use `themes/inspire.css` only — see Inspire skeleton below.

### Theme skeleton (inspire)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Inspire Presentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.css">
  <link rel="stylesheet" href="themes/inspire.css">
</head>
<body>
  <div class="reveal">
    <div class="slides">
      <section class="inspire-dark inspire-corner-accent center">
        <h1 class="inspire-serif-title">Slide Separater</h1>
        <p class="inspire-subtitle">Click to add subtitle</p>
        <div class="inspire-footer">© 2026 Inspire | Confidential</div>
      </section>
      <section class="inspire-light">
        <h1>Contents</h1>
        <ul>
          <li>About Inspire</li>
        </ul>
        <div class="inspire-footer">© 2026 Inspire | Confidential</div>
      </section>
      <section class="inspire-dark inspire-corner-accent">
        <h1 class="inspire-serif-title">We look forward to working with you</h1>
        <p class="contact-name">Name Surname</p>
        <p>Business Development Manager</p>
        <p class="contact-email">email@inspiregroup.com</p>
        <div class="inspire-footer">© 2026 Inspire | Confidential</div>
      </section>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.js"></script>
  <script>Reveal.initialize({ hash: true, slideNumber: true });</script>
</body>
</html>
```

## Domain Knowledge

### reveal.js Basics

```html
<!doctype html>
<html>
<head>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.css">
    <link rel="stylesheet" href="themes/ascentium.css">
</head>
<body>
    <div class="reveal">
        <div class="slides">
            <section>Slide 1</section>
            <section>Slide 2</section>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.js"></script>
    <script>Reveal.initialize();</script>
</body>
</html>
```

### Slide Structure

```html
<!-- Horizontal slides -->
<section>Slide 1</section>
<section>Slide 2</section>

<!-- Vertical slides (nested) -->
<section>
    <section>Vertical 1</section>
    <section>Vertical 2</section>
</section>

<!-- Markdown slides -->
<section data-markdown>
    <textarea data-template>
        ## Slide Title
        - Point 1
        - Point 2
    </textarea>
</section>
```

### Themes

**Brand themes (preferred):** `ascentium` (default), `inspire` — see **Brand themes** above.

Built-in reveal.js themes (`black`, `white`, `night`, …) only when the user explicitly rejects brand themes.

### Transitions

```javascript
Reveal.initialize({
    transition: 'slide',  // none, fade, slide, convex, concave, zoom
    transitionSpeed: 'default',  // default, fast, slow
    backgroundTransition: 'fade'
});
```

### Fragments (Animations)

```html
<section>
    <p class="fragment">Appears first</p>
    <p class="fragment fade-in">Then this</p>
    <p class="fragment fade-up">Then this</p>
    <p class="fragment highlight-red">Highlight</p>
</section>
```

Fragment styles: `fade-in`, `fade-out`, `fade-up`, `fade-down`, `fade-left`, `fade-right`, `highlight-red`, `highlight-blue`, `highlight-green`, `strike`

### Code Highlighting

```html
<section>
    <pre><code data-trim data-line-numbers="1|3-4">
def hello():
    print("Hello")
    print("World")
    return True
    </code></pre>
</section>
```

### Speaker Notes

```html
<section>
    <h2>Slide Title</h2>
    <p>Content</p>
    <aside class="notes">
        Speaker notes go here. Press 'S' to view.
    </aside>
</section>
```

### Backgrounds

```html
<!-- Color background -->
<section data-background-color="#4d7e65">

<!-- Image background -->
<section data-background-image="image.jpg" data-background-size="cover">

<!-- Video background -->
<section data-background-video="video.mp4">

<!-- Gradient background -->
<section data-background-gradient="linear-gradient(to bottom, #283b95, #17b2c3)">
```

### Configuration

```javascript
Reveal.initialize({
    // Display controls
    controls: true,
    controlsTutorial: true,
    progress: true,
    slideNumber: true,
    
    // Behavior
    hash: true,
    respondToHashChanges: true,
    history: true,
    keyboard: true,
    overview: true,
    center: true,
    touch: true,
    loop: false,
    rtl: false,
    shuffle: false,
    
    // Timing
    autoSlide: 0,  // 0 = disabled
    autoSlideStoppable: true,
    
    // Appearance
    width: 960,
    height: 700,
    margin: 0.04,
    minScale: 0.2,
    maxScale: 2.0,
    
    // Plugins
    plugins: [RevealMarkdown, RevealHighlight, RevealNotes]
});
```

## Examples

### Example 1: Tech Talk (ascentium theme)
```html
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>API Design Best Practices</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.css">
    <link rel="stylesheet" href="themes/ascentium.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/plugin/highlight/monokai.css">
</head>
<body>
    <div class="reveal">
        <div class="slides">
            <section class="ascentium-hero center">
                <h1>API Design</h1>
                <h3>Best Practices</h3>
                <p class="tagline">Engineering Team</p>
            </section>
            
            <section>
                <h2>Agenda</h2>
                <ol>
                    <li class="fragment">RESTful Principles</li>
                    <li class="fragment">Authentication</li>
                    <li class="fragment">Error Handling</li>
                    <li class="fragment">Documentation</li>
                </ol>
            </section>
            
            <section>
                <section>
                    <h2>RESTful Principles</h2>
                </section>
                <section>
                    <h3>Resource Naming</h3>
                    <pre><code data-trim class="language-http">
GET /users           # Collection
GET /users/123       # Single resource
POST /users          # Create
PUT /users/123       # Update
DELETE /users/123    # Delete
                    </code></pre>
                </section>
            </section>
            
            <section>
                <h2>Questions?</h2>
                <p>api-team@company.com</p>
            </section>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@4/plugin/highlight/highlight.js"></script>
    <script>
        Reveal.initialize({
            hash: true,
            plugins: [RevealHighlight]
        });
    </script>
</body>
</html>
```

### Example 2: Inspire product deck
```html
<!doctype html>
<html>
<head>
    <title>Inspire Product Launch</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.css">
    <link rel="stylesheet" href="themes/inspire.css">
    <style>
        .metric { font-size: 3em; font-weight: 600; color: #34B3E4; }
    </style>
</head>
<body>
    <div class="reveal">
        <div class="slides">
            <section class="inspire-dark inspire-corner-accent center">
                <h1 class="inspire-serif-title">Introducing</h1>
                <p class="inspire-subtitle">ProductX 2.0</p>
                <div class="inspire-footer">© 2026 Inspire | Confidential</div>
            </section>

            <section class="inspire-light">
                <h1>The Problem</h1>
                <p class="fragment">Teams waste <span class="metric">20%</span> of time on manual tasks</p>
                <div class="inspire-footer">© 2026 Inspire | Confidential</div>
            </section>

            <section class="inspire-tech" data-auto-animate>
                <h2>Our Solution</h2>
                <div data-id="box" style="background: #0A2342; color: #fff; padding: 20px; border-radius: 4px;">
                    AI-Powered Automation
                </div>
            </section>

            <section class="inspire-tech" data-auto-animate>
                <h2>Our Solution</h2>
                <div data-id="box" style="background: #34B3E4; color: #fff; padding: 40px; width: 400px; border-radius: 4px;">
                    <p>AI-Powered Automation</p>
                    <p>90% faster</p>
                </div>
            </section>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.js"></script>
    <script>Reveal.initialize();</script>
</body>
</html>
```

## Resources

- [reveal.js Documentation](https://revealjs.com/)
- [GitHub Repository](https://github.com/hakimel/reveal.js)
- [Demo Slides](https://revealjs.com/demo/)
