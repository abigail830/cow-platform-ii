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

From repo root you can orchestrate backend + frontend together:

```bash
./scripts/start.sh              # migrate DB, then start both (backend :8787, frontend :5180)
./scripts/stop.sh               # stop both
./scripts/restart.sh            # stop then start both (runs migrate before backend)
./scripts/status.sh             # show running state and log paths
./scripts/logs.sh backend       # tail backend log (or: frontend)
```

`start` / `restart` with backend run `npm run db:migrate` first (idempotent — no-op when schema is up to date).

Targets `backend` or `frontend` work for start/stop/restart, e.g. `./scripts/restart.sh backend`.

Equivalent: `./scripts/dev.sh <command> [target]` (also supports `logs`).

Frontend defaults to [http://localhost:5180](http://localhost:5180) — set `CORS_ORIGIN` in `.env` to match.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run setup` | **First-time / fresh DB** — migrate + seed users |
| `npm run db:generate` | Generate a new migration from `src/db/schema.ts` (after schema edits) |
| `npm run db:validate-migrations` | Check SQL files and `drizzle/meta/_journal.json` stay in sync |
| `npm run db:migrate` | Validate + apply schema migrations + RBAC sync (idempotent) |
| `npm run seed` | Upsert demo users + RBAC role assignment |
| `npm run seed:rbac` | Re-sync permissions only (same logic as migrate step) |

You do **not** need a separate `seed:rbac` after `db:migrate` or `setup` — RBAC sync is included automatically.

Already ran `seed:rbac` manually? That is fine; re-running `db:migrate` is safe and idempotent.

## Database schema changes (migrations only)

All database schema changes **must** go through Drizzle migrations — never run `ALTER TABLE` / `CREATE TABLE` directly against the database.

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate` — creates `drizzle/NNNN_*.sql` and updates `drizzle/meta/_journal.json`.
3. Commit the `.sql` file and journal metadata together.
4. Apply with `npm run db:migrate` (also runs automatically via `./scripts/start.sh` / `restart.sh`).

`db:migrate` validates that every numbered SQL file is registered in the journal before applying anything. A common failure mode is adding a `.sql` file without a journal entry — Drizzle will skip it and the table will not exist at runtime.
