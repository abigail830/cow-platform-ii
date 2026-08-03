# Hybrid Search REST API

Base URL: `OPENKMS_API_URL` (no trailing slash).

**Agents:** prefer [MCP tools](mcp.md) at `/api/mcp/hybrid-search`. The Node **scripts** and MCP tools both use these REST endpoints under the hood. Do **not** call them with `curl` and manual auth.

## Endpoints

### `GET /api/hybrid-search/knowledge-bases`

Returns `{ "items": [...] }` — KBs with embedding configured and readable by the caller.

MCP equivalent: `list_knowledge_bases`.

### `POST /api/hybrid-search`

Request body (defaults in parentheses):

```json
{
  "query": "string (required)",
  "knowledge_base_ids": ["uuid", "..."],
  "search_type": "all | chunks | faqs (all)",
  "top_k": 10,
  "settings": {
    "bm25_enabled": true,
    "rrf_k": 60,
    "recall_k": 25,
    "rerank_model_config_id": null,
    "rerank_instruct": null
  }
}
```

Response: `{ "items": [ { "knowledge_base_name", "source_name", "source_type", "document_id", "chunk_index", "content", "score", "debug": { ... } } ] }`

MCP equivalent: `hybrid_search` (maps `kb_ids` → `knowledge_base_ids`, etc.).

## Not for agents

- `GET/PATCH /api/hybrid-search/preferences` — UI only
