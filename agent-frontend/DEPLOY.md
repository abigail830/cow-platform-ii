# Vercel static frontend + API proxy

Deploy as a **separate** Vercel project from `agent-backend`.

## Environment variables (Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `BACKEND_ORIGIN` | Yes | Backend URL, e.g. `https://cow-platform-ii-backend.vercel.app` (no trailing slash) |
| `VITE_FLUE_LIVE_MODE` | No | Default `sse` |

## Routing

- `middleware.ts` (Edge): proxies `/api/*` and `/health` to `BACKEND_ORIGIN` (supports SSE)
- `vercel.json`: SPA fallback to `index.html` for all other paths

Local dev uses Vite proxy (`vite.config.ts`); `BACKEND_ORIGIN` is only used on Vercel.

## SSE note

Agent chat uses SSE end-to-end. Backend needs Vercel **Pro** for `maxDuration` > 10s on serverless functions.
