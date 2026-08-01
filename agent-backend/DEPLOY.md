# Vercel serverless (agent-backend)

Deploy **only** `agent-backend` as a separate Vercel project. Pipeline jobs run on GitHub Actions (`PIPELINE_WORKER=github_actions` is automatic when `VERCEL` is set).

## Prerequisites

- Node.js **22.x** on Vercel (Project Settings → General → Node.js Version)
- Neon Postgres linked via Vercel Storage (or `DATABASE_URL` env)
- `openkms-cli` GHA secrets (on **this** monorepo): `OPENKMS_API_URL` = this backend’s public URL

## Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `agent-backend` (**required** — if left as repo root, runtime uses `agent-backend/src/app.js` and crashes with `ERR_MODULE_NOT_FOUND` for `.ts` imports) |
| **Node.js** | 22.x |
| **Framework Preset** | Other / leave unset — `vercel.json` sets `"framework": null` |

Create a **separate** Vercel project for the backend (e.g. `cow-platform-ii` → `https://cow-platform-ii.vercel.app`).

Health check: `https://cow-platform-ii.vercel.app/health` (frontend is a different project, e.g. `https://cow-platform.vercel.app`).

## Region

Default **Hong Kong (`hkg1`)** via `vercel.json` → `"regions": ["hkg1"]` and `.vc-config.json` from the build script (better reach to mainland Aliyun OSS than `sin1`).

To override at build time, set Vercel env `VERCEL_REGIONS` (comma-separated), e.g. `sin1` (Singapore) or `icn1` (Seoul).

You can also override in the Vercel dashboard: **Project → Settings → Functions → Function Regions** (Pro plan may be required for multi-region).

## Build

`npm run build:vercel` emits Vercel **Build Output API** under `.vercel/output/` (bundled **CJS** handler at `functions/index.func/index.cjs`, ~15 MB). The bundle includes `src/flue-vercel-init.ts`, which calls `configureFlueRuntime()` so `/api/agents/*` works without `flue build`’s `serve()` entry. Do not use ESM here — `pg` triggers `Dynamic require of "events" is not supported` on Vercel.

Run `npx tsc --noEmit` locally before deploy to catch type errors.

## Required environment variables

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Neon pooler URL (Vercel integration) |
| `JWT_SECRET` | Production secret |
| `CORS_ORIGIN` | Frontend origin, e.g. `https://your-frontend.vercel.app` |
| `OPENKMS_API_URL` | **This** deployment URL (GHA callbacks) |
| `OPENKMS_CLI_BASIC_USER` / `OPENKMS_CLI_BASIC_PASSWORD` | internal-api auth |
| `GITHUB_PIPELINE_TOKEN` | PAT with `actions:write` on `cow-platform-ii` |
| `GITHUB_PIPELINE_REPOSITORY` | `abigail830/cow-platform-ii` |
| `MODEL_PROFILE` + provider keys | Agent models |
| `AWS_*` | OSS document storage |
| `OKF_BUNDLE_PATH` | **Required** for Proposal Chef — see below |

### OKF knowledge bundle (Proposal Chef tools)

`npm run build:vercel` downloads [okf-knowledge-bundle](https://github.com/abigail830/okf-knowledge-bundle) and copies `smart-proposal-knowledge/` into the function as `okf-bundle/` (all Word/PPTX examples, markdown, extractions committed in that repo).

**Runtime env (required):**

| Variable | Vercel value | Local dev value |
|----------|--------------|-----------------|
| `OKF_BUNDLE_PATH` | `okf-bundle` | Absolute path to a directory containing `index.md` |

There is no automatic fallback if `OKF_BUNDLE_PATH` is unset — startup or first agent request will fail with an explicit configuration error.

Build-time vendor overrides (optional):

| Variable | Default | Notes |
|----------|---------|--------|
| `OKF_BUNDLE_GIT_REPO` | `abigail830/okf-knowledge-bundle` | `owner/repo` |
| `OKF_BUNDLE_GIT_REF` | `main` | Branch to vendor |
| `OKF_BUNDLE_GIT_SUBDIR` | `smart-proposal-knowledge` | Subfolder in repo |
| `OKF_BUNDLE_LOCAL_PATH` | — | Optional: copy local path instead of GitHub fetch |

Push bundle changes to GitHub, then **redeploy backend** to pick them up.

**OSS CORS (required for document detail):** Parsed content (`markdown.md`, `page_index.json`) is fetched by the **browser** via presigned URLs. In Aliyun OSS → bucket → **Cross-Origin Resource Sharing**, allow your frontend origin, e.g. `https://cow-platform.vercel.app`, with methods `GET` and headers `*`. Without CORS, the detail page shows storage read errors while the list still works.

Do **not** set `PIPELINE_WORKER=spawn` on Vercel.

## KB PageIndex import (isolated from document parse)

Knowledge base import uses **separate** jobs (`app_kb_import_jobs`), CLI (`openkms-cli kb pageindex-import`), and GHA workflow **`openkms-kb-pageindex-import.yml`** (`OpenKMS KB PageIndex Import`). It does **not** use `openkms-pipeline.yml` or `app_pipeline_jobs`.

| Variable | Notes |
|----------|--------|
| `KB_PAGEINDEX_IMPORT_WORKER` | `github_actions` on Vercel (default); `spawn` for local dev |
| `GITHUB_KB_PAGEINDEX_IMPORT_WORKFLOW` | Default `openkms-kb-pageindex-import.yml` |
| `GITHUB_PIPELINE_TOKEN` / `GITHUB_PIPELINE_REPOSITORY` | Same PAT/repo as document pipeline (workflow dispatch) |

Enable the workflow in GitHub **Actions** for this repo. After deploy, smoke test locally: `npm run verify:knowledge-bases` (backend must be running).

See `docs/knowledge-bases.md` for API and data model.

## Database migrate

Run once after first deploy (or in CI):

```bash
npm run db:migrate
```

## Verify

```bash
curl https://<backend>/health
# {"ok":true,"service":"agent-backend"}
```

After a good deploy, the Vercel function size should be ~10 MB (full esbuild bundle), not ~5 MB (Hono preset compiling `src/` only).

## SSE / agent streaming

`maxDuration: 300` is set in `.vc-config.json`. Vercel **Hobby** still caps execution at **10s**; **Pro** is required for longer agent SSE streams.

## Known serverless limits

- No in-process pipeline watchdog (stuck jobs need manual retry or GHA re-run)
- Chunked upload sessions are in-memory (single-instance assumption); large multi-part uploads may fail under concurrent instances
- OKF bundle is vendored at build (~tens of MB); update knowledge by pushing to [okf-knowledge-bundle](https://github.com/abigail830/okf-knowledge-bundle) and redeploying backend
