# Hybrid Search MCP

Standard MCP server on the OKF backend. Same ACL and retrieval logic as `POST /api/hybrid-search`.

## Connection

| Field | Value |
|-------|--------|
| URL | `{OPENKMS_API_URL}/api/mcp/hybrid-search` |
| Transport | Streamable HTTP |
| Auth | `Authorization: Bearer okf_…` |

JWT session tokens also work for direct HTTP calls; **external clients (Cursor, CI)** should use `okf_` API keys.

## Tools

### `list_knowledge_bases`

Optional input:

| Field | Type | Description |
|-------|------|-------------|
| `group_by_embedding` | boolean | Group items by embedding model config |

Returns JSON text: `{ visible_ids, items }` (or grouped form when requested).

### `hybrid_search`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Standalone retrieval query |
| `kb_ids` | uuid[] | no | Subset of visible KB ids; default all visible |
| `top_k` | number | no | Default 10 |
| `search_type` | `all` \| `chunks` \| `faqs` | no | Default `all` |
| `recall_k` | number | no | Default 25 |
| `rrf_k` | number | no | Default 60 |
| `no_bm25` | boolean | no | Disable BM25 leg |
| `rerank_model_id` | uuid | no | Rerank model config |

Returns JSON text: `{ items: [...] }` with the same result shape as REST.

## OKF kb-qa agent

Configured in `agent-catalog/kb-qa/agent.yaml` with `internalPath: /api/mcp/hybrid-search` and `useAgentRequestHeaders: true`. The runtime forwards Playground `Authorization` and `x-openkms-api-key` on loopback calls—no separate MCP env URL required.

Flue tool names: `mcp__hybrid-search__list_knowledge_bases`, `mcp__hybrid-search__hybrid_search`.

## Errors

| Situation | Typical outcome |
|-----------|-----------------|
| Missing/invalid auth | 401 |
| No hybrid-search permission | 403 |
| `kb_ids` not visible | Error text in tool result |
| No visible KBs | Error text in tool result |
