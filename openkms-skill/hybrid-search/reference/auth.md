# Authentication

## Personal API key (only supported method)

1. Log in to the web UI (JWT — for browsing only).
2. Open **Settings → API keys** → **Generate API key**.
3. Copy `okf_…` immediately (shown once).

### Local / CLI / external agents

```bash
export OPENKMS_API_URL=http://127.0.0.1:8787
export OPENKMS_API_KEY=okf_…
```

Scripts read these variables; do not embed the key in commands or logs.

### OKF Agent Playground (kb-qa)

Save the same key under **Settings → API keys → Playground agent API key** (browser `localStorage`). Requests send `X-OpenKMS-Api-Key`; the backend injects `OPENKMS_API_KEY` into the agent sandbox.

## Server-side storage

| Stored in DB | Stored client-side only |
|--------------|-------------------------|
| `key_hash`, `key_prefix`, user id, revoke time | Full `okf_…` plaintext |

## Permissions

1. API key → user identity
2. RBAC: `knowledge-management:hybrid-search:read`
3. KB ACL: owner + share grants

## Do not use

- `POST /api/auth/login` + JWT in scripts (use API keys)
- `/internal-api/*` with `OPENKMS_CLI_BASIC_*` (bypasses user ACL)
- `A2A_API_KEY` (not for hybrid-search)
