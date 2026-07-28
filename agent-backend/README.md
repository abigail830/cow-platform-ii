# Agent Backend

Hono API for the Agent Platform (auth, admin, agents).

## Prerequisites

- **Node.js >= 22** (see `.nvmrc` — run `nvm use` in this directory)
- **PostgreSQL** with `DATABASE_URL` set in `.env`

## First-time setup

From `agent-backend/`:

```bash
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and JWT_SECRET

npm install
npm run setup
```

`npm run setup` runs:

1. **`db:migrate`** — applies Drizzle SQL migrations **and** syncs RBAC permissions/roles from `src/auth/rbac-catalog.ts`
2. **`seed`** — creates demo users and re-syncs RBAC so admin accounts get the `admin` role

### Demo logins (after `npm run setup`)

| Email | Password | Notes |
|-------|----------|-------|
| `admin@example.com` | `admin123` | Full admin access |
| `user@example.com` | `user123` | Regular user |

## Daily development

```bash
npm run dev
```

From repo root you can also use `./scripts/dev.sh start`.

Frontend defaults to [http://localhost:5180](http://localhost:5180) — set `CORS_ORIGIN` in `.env` to match.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run setup` | **First-time / fresh DB** — migrate + seed users |
| `npm run db:migrate` | Apply schema migrations + RBAC sync (idempotent) |
| `npm run seed` | Upsert demo users + RBAC role assignment |
| `npm run seed:rbac` | Re-sync permissions only (same logic as migrate step) |

You do **not** need a separate `seed:rbac` after `db:migrate` or `setup` — RBAC sync is included automatically.

Already ran `seed:rbac` manually? That is fine; re-running `db:migrate` is safe and idempotent.
