# Vercel serverless (agent-backend)

Deploy **only** `agent-backend` as a separate Vercel project. Pipeline jobs run on GitHub Actions (`PIPELINE_WORKER=github_actions` is automatic when `VERCEL` is set).

## Prerequisites

- Node.js **22.x** on Vercel (Project Settings → General → Node.js Version)
- Neon Postgres linked via Vercel Storage (or `DATABASE_URL` env)
- `openkms-cli` repo GHA secrets: `OPENKMS_API_URL` = this backend’s public URL

## Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `agent-backend` (required when using the monorepo) |
| **Node.js** | 22.x |
| **Framework Preset** | Other / leave unset — `vercel.json` sets `"framework": null` |

Health check URL is the **backend** deployment, e.g. `https://<backend-project>.vercel.app/health`.

If you use a separate frontend project, do not expect `/health` on the frontend URL unless `BACKEND_ORIGIN` is set (see `agent-frontend/DEPLOY.md`).

## Build

`npm run build:vercel` emits Vercel **Build Output API** under `.vercel/output/` (bundled CJS handler at `functions/index.func/index.js`, ~10 MB). This bypasses the Hono framework preset, which otherwise compiles `src/app.ts` without rewriting `.ts` imports and crashes at runtime (`ERR_MODULE_NOT_FOUND`).

Run `npx tsc --noEmit` locally before deploy to catch type errors.

## Required environment variables

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Neon pooler URL (Vercel integration) |
| `JWT_SECRET` | Production secret |
| `CORS_ORIGIN` | Frontend origin, e.g. `https://your-frontend.vercel.app` |
| `OPENKMS_API_URL` | **This** deployment URL (GHA callbacks) |
| `OPENKMS_CLI_BASIC_USER` / `OPENKMS_CLI_BASIC_PASSWORD` | internal-api auth |
| `GITHUB_PIPELINE_TOKEN` | PAT with `actions:write` on `openkms-cli` |
| `GITHUB_PIPELINE_REPOSITORY` | `abigail830/openkms-cli` |
| `MODEL_PROFILE` + provider keys | Agent models |
| `AWS_*` | OSS document storage |

Do **not** set `PIPELINE_WORKER=spawn` on Vercel.

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
- OKF bundle agent tools optional (not required for document pipeline)
