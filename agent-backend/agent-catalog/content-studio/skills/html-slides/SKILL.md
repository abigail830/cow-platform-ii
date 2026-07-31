---
name: html-slides
description: Create interactive HTML presentations with reveal.js. Use when the user wants web-based slides, HTML deck, browser presentation, or reveal.js instead of PowerPoint.
license: MIT
---

# HTML Slides Skill

## Overview

Create stunning HTML-based presentations using **reveal.js** — interactive, responsive slides with animations, code highlighting, speaker notes, and transitions.

## When to use

- User asks for HTML slides, reveal.js, or browser-based presentation
- Interactive demos, code walkthroughs, or embeddable web decks
- Not for `.pptx` / PowerPoint (use `pptx` skill instead)

## How to work

1. Clarify topic, audience, theme, and slide count if missing.
2. Produce a **single self-contained HTML file** (CDN links for reveal.js are fine).
3. Include title slide, agenda, structured sections, and closing slide.
4. Use fragments, backgrounds, and code highlighting when they add clarity.
5. Save as `presentation.html` (or a descriptive name) in the workspace.

## Minimal reveal.js skeleton

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Presentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/theme/white.css">
</head>
<body>
  <div class="reveal">
    <div class="slides">
      <section><h1>Title</h1></section>
      <section><h2>Section</h2></section>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.js"></script>
  <script>Reveal.initialize({ hash: true, slideNumber: true });</script>
</body>
</html>
```

## Features to use when appropriate

- **Fragments** — `class="fragment fade-in"` for progressive reveal
- **Speaker notes** — `<aside class="notes">...</aside>`
- **Code** — `<pre><code data-trim data-line-numbers>` with highlight plugin
- **Backgrounds** — `data-background-color`, `data-background-image`, gradients
- **Themes** — `white`, `black`, `night`, `moon`, `league`, etc.

## Quality checklist

- Readable contrast and font sizes on a projector
- One main idea per slide; avoid walls of text
- Consistent heading hierarchy
- Working `Reveal.initialize()` and valid HTML

## References

- [reveal.js documentation](https://revealjs.com/)
- [Demo slides](https://revealjs.com/demo/)
