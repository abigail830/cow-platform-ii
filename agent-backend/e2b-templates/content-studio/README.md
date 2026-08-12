# Content Studio E2B template (`okf-content-studio`)

Pre-baked environment for **pptx**, **docx**, and **html-slides** skills — avoids per-session `apt` / `pip` / `npm install`.

## What is installed

| Layer | Packages |
|-------|----------|
| OS (apt) | LibreOffice, Poppler (`pdftoppm`), Pandoc, Python 3 + dev headers, gcc, zip/unzip |
| pip | `markitdown[pptx]`, Pillow, defusedxml, lxml |
| npm (global) | pptxgenjs, docx, react, react-dom, react-icons, sharp |

Workspace directory: `/home/user/content-studio` (matches `agent-catalog/content-studio/agent.yaml` `sandbox.cwd`).

Also baked into the image:

| Path | Contents |
|------|----------|
| `/home/user/content-studio/skills/docx/scripts` | docx skill scripts |
| `/home/user/content-studio/skills/pptx/scripts` | pptx skill scripts |
| `/home/user/content-studio/skills/html-slides/references` | `ascentium-deck.md`, `inspire-deck.md` |
| `/home/user/content-studio/skills/html-slides/assets` | `ascentium/*.png`, `inspire/*.png` (brand chrome) |

## Build

```bash
cd agent-backend
export E2B_API_KEY=...
npm run e2b:build-content-studio-template
```

Optional overrides:

```bash
E2B_CONTENT_STUDIO_TEMPLATE=my-team-content-studio \
E2B_CONTENT_STUDIO_TEMPLATE_TAG=1.1 \
npm run e2b:build-content-studio-template
```

First build can take several minutes (LibreOffice is large).

## Wire into agents

```yaml
sandbox:
  provider: e2b
  templateId: okf-content-studio:1.9   # alias:tag — bare alias also resolves via platform default tag
  cwd: /home/user/content-studio
```

Other document agents can reuse the same `templateId` — lifecycle is platform-wide (`src/sandboxes/e2b-session-manager.ts`).

## Verify in a sandbox

After build:

```bash
node -e "require('pptxgenjs'); require('docx'); console.log('npm ok')"
python3 -c "import markitdown, lxml, defusedxml; from PIL import Image; print('pip ok')"
soffice --version
pdftoppm -v
pandoc --version
```

## Updating

1. Edit `template.ts` (and keep `Dockerfile` in sync for readability).
2. Bump `E2B_CONTENT_STUDIO_TEMPLATE_TAG` or change the tag in `template.ts` defaults.
3. Re-run the build script.
4. Update `agent.yaml`, `sandbox/e2b-content-studio.yaml`, and `src/sandboxes/e2b-templates.ts` default tag to match.
5. Redeploy backend — no code change needed if alias name unchanged.

**1.9** — html-slides reference fix: `position: absolute` on `.reveal .slides section` (reveal.js layout).
