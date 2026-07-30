# Vercel static frontend + API proxy

Deploy as a **separate** Vercel project from `agent-backend` (e.g. frontend = `cow-platform` → `https://cow-platform.vercel.app`, backend = `cow-platform-ii` → `https://cow-platform-ii.vercel.app`).

## Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `agent-frontend` |

## Environment variables (Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `BACKEND_ORIGIN` | Yes | Backend URL: `https://cow-platform-ii.vercel.app` — **not** the frontend URL (`https://cow-platform.vercel.app`) |
| `VITE_FLUE_LIVE_MODE` | No | Default `sse` |

## Routing

- `middleware.ts` (Edge): proxies `/api/*` and `/health` to `BACKEND_ORIGIN` (supports SSE)
- `vercel.json`: SPA fallback to `index.html` for all other paths

Local dev uses Vite proxy (`vite.config.ts`); `BACKEND_ORIGIN` is only used on Vercel.

`/health` on the **frontend** URL proxies to `BACKEND_ORIGIN`. If `BACKEND_ORIGIN` is missing or points to the frontend URL itself, `/health` will fail. Use the **backend** project URL for direct health checks.

## SSE note

Agent chat uses SSE end-to-end. Backend needs Vercel **Pro** for `maxDuration` > 10s on serverless functions.
