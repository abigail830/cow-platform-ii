# openkms-skill

Portable skills for querying OpenKMS / OKF knowledge bases.

## Auth

| Variable | Description |
|----------|-------------|
| `OPENKMS_API_URL` | Backend base URL (e.g. `http://127.0.0.1:8787`) |
| `OPENKMS_API_KEY` | Personal API key (`okf_…`) from **Settings → API keys** |

For MCP: `Authorization: Bearer okf_…` on the MCP URL. See each skill's `reference/auth.md` and `reference/mcp.md`.

## Skills

| Skill | Path | Description |
|-------|------|-------------|
| hybrid-search | [hybrid-search/](hybrid-search/) | Cross-KB hybrid retrieval (MCP-first) |

## Using outside the OKF platform

### Recommended — MCP (Cursor, Claude Desktop, etc.)

Connect to:

`{OPENKMS_API_URL}/api/mcp/hybrid-search`

Tools: `list_knowledge_bases`, `hybrid_search`. Details: [hybrid-search/reference/mcp.md](hybrid-search/reference/mcp.md).

### Optional — Node scripts

If the host has no MCP client, set env vars and run from the skill root:

```bash
node scripts/list_knowledge_bases.mjs
node scripts/hybrid_search.mjs --query "…"
```

Node 18+ required. Same ACL as MCP.
