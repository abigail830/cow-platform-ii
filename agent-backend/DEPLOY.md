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

`npm run build:vercel` emits Vercel **Build Output API** under `.vercel/output/` (bundled **CJS** handler at `functions/index.func/index.cjs`, ~15 MB). Do not use ESM here — `pg` triggers `Dynamic require of "events" is not supported` on Vercel.

Run `npx tsc --noEmit` locally before deploy to catch type errors.

## Required environment variables

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Neon pooler URL (Vercel integration) |
| `JWT_SECRET` | Production secret |
| `CORS_ORIGIN` | **Required** when frontend and backend are separate Vercel projects — browser origin only, e.g. `https://cow-platform.vercel.app` (no trailing slash). Without this, login/API calls from the SPA fail with CORS / "Failed to fetch". |
| `OPENKMS_API_URL` | **This backend deployment URL** (GHA callbacks), e.g. `https://cow-platform-ii.vercel.app` — **not** the frontend SPA host (`cow-platform.vercel.app`). Frontend only proxies `/api` and `/health`; `/internal-api/*` must hit backend directly or workers get HTML/404. |
| `OPENKMS_CLI_BASIC_USER` / `OPENKMS_CLI_BASIC_PASSWORD` | internal-api auth |
| `GITHUB_PIPELINE_TOKEN` | PAT with `actions:write` on `cow-platform-ii` |
| `GITHUB_PIPELINE_REPOSITORY` | `abigail830/cow-platform-ii` |
| `AWS_*` | OSS document + audio storage |

LLM / embedding API keys are stored in **Admin → Model Configuration** (database), not in Vercel env.

Pipeline parse/transcribe secrets (`OPENKMS_BAIDU_*`, `OPENKMS_DOCMIND_*`, etc.) belong in **GitHub Actions secrets** for `openkms-cli` workers — not on the backend Vercel project unless you run `PIPELINE_WORKER=spawn` locally.

**OSS CORS (required for document detail and browser uploads):** Parsed content (`markdown.md`, `page_index.json`) is fetched by the **browser** via presigned URLs. Document, audio, and capture segment uploads use **presigned PUT** from the browser directly to OSS (bypasses Vercel's ~4.5 MB request body limit). In Aliyun OSS → bucket → **Cross-Origin Resource Sharing**, allow your frontend origin (e.g. `https://cow-platform.vercel.app`), with methods **`GET`, `PUT`, `HEAD`** and headers `*`. Without GET CORS, the detail page shows storage read errors while the list still works. Without PUT CORS, large uploads fail with a network/CORS error.

Do **not** set `PIPELINE_WORKER=spawn` on Vercel.

Document parse jobs dispatch **`openkms-pipeline.yml`** (Actions name: **OpenKMS Document Parse**). Audio transcription uses a separate workflow **`openkms-audio-transcribe.yml`** (Actions name: **OpenKMS Audio Transcribe**), linked from the system `aliyun-qwen-audio-transcribe` pipeline row (`workflow_file`). Audio capture post-process uses **`openkms-audio-capture-post-process.yml`** (override via `GITHUB_AUDIO_CAPTURE_PIPELINE_WORKFLOW`), linked from `audio-capture-post-process`.

## KB PageIndex import (isolated from document parse)

Knowledge base import uses **separate** jobs (`app_kb_import_jobs`) and GHA workflow from the linked pipeline row (`workflow_file`, default **`openkms-kb-pageindex-import.yml`**). CLI args come from `app_pipeline_configs.command_template` on the KB’s `pipeline_id` (PageIndex KBs auto-link to system `kb-pageindex-import` at creation). It does **not** use `openkms-pipeline.yml` or `app_pipeline_jobs`.

| Variable | Notes |
|----------|--------|
| `KB_IMPORT_WORKER` | `github_actions` on Vercel (default); `spawn` for local dev |
| `GITHUB_KB_IMPORT_WORKFLOW` | Default `openkms-kb-pageindex-import.yml` |
| `GITHUB_PIPELINE_TOKEN` / `GITHUB_PIPELINE_REPOSITORY` | Same PAT/repo as document pipeline (workflow dispatch) |

Enable the workflow in GitHub **Actions** for this repo. After deploy, smoke test locally: `npm run verify:knowledge-bases` (backend must be running).

See `docs/knowledge-bases.md` for API and data model.

## Database migrate

`npm run build:vercel` runs `npm run db:migrate` automatically when `DATABASE_URL` is set on the Vercel project (recommended). You can still run it manually:

```bash
npm run db:migrate
```

## Verify

```bash
curl https://<backend>/health
# {"ok":true,"service":"agent-backend"}
```

After a good deploy, the Vercel function size should be ~10 MB (full esbuild bundle), not ~5 MB (Hono preset compiling `src/` only).

## Known serverless limits

- No in-process pipeline watchdog (stuck jobs need manual retry or GHA re-run)
- Chunked upload sessions are in-memory (single-instance assumption); large multi-part uploads may fail under concurrent instances
