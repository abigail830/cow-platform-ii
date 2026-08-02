# Hybrid Search API

Base URL: `OPENKMS_API_URL` (no trailing slash).

**Agents:** use `scripts/*.mjs` — they read `OPENKMS_API_KEY` from the environment. Do **not** call these endpoints with `curl` or print auth headers.

## Endpoints (skill uses)

### `GET /api/hybrid-search/knowledge-bases`

Returns `{ "items": [...] }` — only KBs with embedding configured **and** readable by the key owner.

### `POST /api/hybrid-search`

Request body (skill defaults in parentheses):

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

## Not used by skill

- `GET/PATCH /api/hybrid-search/preferences` — UI only
