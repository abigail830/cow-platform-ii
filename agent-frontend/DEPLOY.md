# Vercel static frontend

Deploy as a **separate** Vercel project from `agent-backend` (e.g. frontend = `cow-platform` → `https://cow-platform.vercel.app`, backend = `cow-platform-ii` → `https://cow-platform-ii.vercel.app`).

## Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `agent-frontend` |
| **Function region** | `hkg1` (Hong Kong) via `vercel.json` — mainly affects Edge middleware; API/upload traffic uses `VITE_API_ORIGIN` (backend region) |

## Environment variables (frontend Vercel project)

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_ORIGIN` | **Yes** | Backend origin, e.g. `https://cow-platform-ii.vercel.app` (no trailing slash). Set in **Vercel env** or committed `.env.production` — **not** in local `.env` (breaks `npm run dev`). |
| `VITE_FLUE_LIVE_MODE` | No | Production **forces `long-poll`** (SSE cannot see work from another serverless instance). Set `VITE_FLUE_ALLOW_SSE=1` only to debug SSE. Local default `sse`. |

**Local dev:** use `.env.development` only (`VITE_API_ORIGIN` unset). Copy `.env.example` → `.env` if needed; do not point `VITE_API_ORIGIN` at production while developing locally.

`BACKEND_ORIGIN` + `middleware.ts` are **legacy** (Edge proxy). Vercel Edge drops Flue `202` admission JSON bodies; use `VITE_API_ORIGIN` instead.

## Environment variables (backend Vercel project)

| Variable | Required | Notes |
|----------|----------|--------|
| `CORS_ORIGIN` | **Yes** | Frontend origin, e.g. `https://cow-platform.vercel.app` |

## Local dev

Leave `VITE_API_ORIGIN` unset in `.env`. Vite proxy (`vite.config.ts`) forwards `/api` to `http://127.0.0.1:8787`.

## Live updates (do not use SSE on Vercel)

Flue `subscribe()` is **in-process only**. On Vercel the admission worker and the browser's live GET run in **different serverless instances**, so SSE never sees new tokens and can hold the function until `maxDuration`. Production therefore uses **`VITE_FLUE_LIVE_MODE=long-poll`**.

Backend still needs Vercel **Pro** for `maxDuration` > 10s so a long-poll wait (up to ~30s) is not killed.
