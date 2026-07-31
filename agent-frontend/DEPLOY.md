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
| `VITE_API_ORIGIN` | **Yes** | Backend origin, e.g. `https://cow-platform-ii.vercel.app` (no trailing slash). Baked into the build; browser calls backend directly. |
| `VITE_FLUE_LIVE_MODE` | No | Default `sse` |

`BACKEND_ORIGIN` + `middleware.ts` are **legacy** (Edge proxy). Vercel Edge drops Flue `202` admission JSON bodies; use `VITE_API_ORIGIN` instead.

## Environment variables (backend Vercel project)

| Variable | Required | Notes |
|----------|----------|--------|
| `CORS_ORIGIN` | **Yes** | Frontend origin, e.g. `https://cow-platform.vercel.app` |

## Local dev

Leave `VITE_API_ORIGIN` unset in `.env`. Vite proxy (`vite.config.ts`) forwards `/api` to `http://127.0.0.1:8787`.

## SSE note

Agent chat uses SSE end-to-end. Backend needs Vercel **Pro** for `maxDuration` > 10s on serverless functions.
