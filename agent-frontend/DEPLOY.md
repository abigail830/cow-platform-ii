# Vercel static frontend

Deploy as a **separate** Vercel project from `agent-backend` (e.g. frontend = `cow-platform` → `https://cow-platform.vercel.app`, backend = `cow-platform-ii` → `https://cow-platform-ii.vercel.app`).

## Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `agent-frontend` |
| **Function region** | `hkg1` (Hong Kong) via `vercel.json` |

## Environment variables (frontend Vercel project)

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_ORIGIN` | **Yes** | Backend origin, e.g. `https://cow-platform-ii.vercel.app` (no trailing slash). Set in Vercel env or committed `.env.production` — **not** in local `.env` (breaks `npm run dev`). |

**Local dev:** use `.env.development` only (`VITE_API_ORIGIN` unset). Vite proxy forwards `/api` to `http://127.0.0.1:8787`.

## Environment variables (backend Vercel project)

| Variable | Required | Notes |
|----------|----------|--------|
| `CORS_ORIGIN` | **Yes** | Frontend origin, e.g. `https://cow-platform.vercel.app` |

See `agent-backend/DEPLOY.md` for the full backend env list.
