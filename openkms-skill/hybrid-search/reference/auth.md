# Authentication

## Personal API key (`okf_…`)

1. Log in to the web UI.
2. **Settings → API keys** → generate and copy `okf_…` (shown once).

### MCP clients (Cursor, Claude Desktop, scripts)

```bash
export OPENKMS_API_URL=http://127.0.0.1:8787
export OPENKMS_API_KEY=okf_…
```

- **MCP:** `Authorization: Bearer okf_…` on `{OPENKMS_API_URL}/api/mcp/hybrid-search`
- **Scripts:** read `OPENKMS_API_KEY` from the environment (see [mcp.md](mcp.md) for MCP-first workflow)

### OKF Agent Playground (kb-qa)

- Session **JWT** is sent on agent requests (`Authorization: Bearer …`).
- Optionally save the same `okf_…` under **Settings → API keys → Playground agent API key** (`x-openkms-api-key`).
- Hybrid-search **MCP** is called on loopback with those headers forwarded—no sandbox env injection.

## Server-side storage

| In database | Client only |
|---------------|-------------|
| `key_hash`, `key_prefix`, user id, revoke time | Full `okf_…` plaintext |

## Permissions

1. API key or JWT → user identity
2. RBAC: `knowledge-management:hybrid-search:read`
3. KB ACL: owner + share grants

## Do not use

- Login password or `POST /api/auth/login` in automation (use API keys)
- `/internal-api/*` with `OPENKMS_CLI_BASIC_*` (bypasses user ACL)
- `A2A_API_KEY` for hybrid-search retrieval
