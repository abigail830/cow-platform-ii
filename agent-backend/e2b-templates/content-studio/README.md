# Content Studio E2B template (`okf-content-studio`)

Pre-baked environment for **pptx**, **docx**, and **html-slides** skills — avoids per-session `apt` / `pip` / `npm install`.

## What is installed

| Layer | Packages |
|-------|----------|
| OS (apt) | LibreOffice, Poppler (`pdftoppm`), Pandoc, Python 3 + dev headers, gcc, zip/unzip |
| pip | `markitdown[pptx]`, Pillow, defusedxml, lxml |
| npm (global) | pptxgenjs, docx, react, react-dom, react-icons, sharp |

Workspace directory: `/home/user/content-studio` (matches `agent-catalog/content-studio/agent.yaml` `sandbox.cwd`).

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
  templateId: okf-content-studio:1.1   # alias:tag — bare alias resolves to tag 1.1 in code
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
2. Bump `E2B_CONTENT_STUDIO_TEMPLATE_TAG` or change the tag in `build.ts` defaults.
3. Re-run the build script.
4. Redeploy backend — no code change needed if alias name unchanged.
