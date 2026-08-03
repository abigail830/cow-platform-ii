---
name: hybrid-search
description: Hybrid retrieval over OpenKMS knowledge bases (dense + BM25 + RRF). Prefer MCP tools at /api/mcp/hybrid-search; optional Node scripts for shell/CI without an MCP client.
---

# Hybrid Search

Cross–knowledge-base retrieval over **RAG** and **FAQ** bases readable by the current user (owner + share ACL).

## Preferred — MCP (Cursor, OKF kb-qa, any MCP host)

**Endpoint:** `{OPENKMS_API_URL}/api/mcp/hybrid-search`  
**Transport:** Streamable HTTP  
**Auth:** `Authorization: Bearer okf_…` (personal API key from **Settings → API keys**)

| MCP tool | Purpose |
|----------|---------|
| `list_knowledge_bases` | Authoritative ACL-filtered KB list |
| `hybrid_search` | Retrieval (`query` required; optional `kb_ids`, `top_k`, `search_type`, `no_bm25`, `rerank_model_id`, …) |

In OKF **kb-qa** (Flue), the same tools appear as:

- `mcp__hybrid-search__list_knowledge_bases`
- `mcp__hybrid-search__hybrid_search`

Credentials are injected by the platform (session JWT and/or Playground API key)—do not probe keys in tool output.


## Workflow

1. **List** — `list_knowledge_bases`. Never hard-code KB UUIDs from chat.
2. **Scope** — match user-named KBs to `name` in the list; default to all visible IDs.
3. **Search** — `hybrid_search` with a **standalone retrieval query** (not necessarily the user's raw last message). Defaults match REST: `top_k=10`, `search_type=all`, BM25 on, `rrf_k=60`, `recall_k=25`.
4. **Answer** — cite `knowledge_base_name`, `source_name`, `chunk_index`, and `source_type`. Do not invent sources.

## Fallback — Node scripts (no MCP client)

For shell, CI, or hosts that cannot load MCP tools. Requires Node **18+** and env vars:

| Variable | Purpose |
|----------|---------|
| `OPENKMS_API_URL` | Backend base URL (no trailing slash) |
| `OPENKMS_API_KEY` | `okf_…` API key |

From the **skill root**:

```bash
node scripts/list_knowledge_bases.mjs
node scripts/hybrid_search.mjs --query "standalone retrieval query"
```

Optional flags: `--kb-ids id1,id2`, `--top-k N`, `--search-type all|chunks|faqs`, `--no-bm25`, `--rerank-model-id UUID`, `--pretty`.

Scripts call the same REST API as MCP; see [reference/api.md](reference/api.md). **Do not** use `curl` with manual auth headers.

## Security and efficiency

- **MCP hosts:** call MCP tools only—do not `bash`/`node scripts/…` for retrieval.
- Do **not** `read` / `read_skill_resource` on `reference/`, `shared/`, or `scripts/` during normal retrieval.
- `kb_ids` must be a subset of listed IDs; forbidden IDs return an error.
- Empty list → tell the user no searchable KBs are visible.

## Reference

- [reference/mcp.md](reference/mcp.md) — MCP URL, auth, tool args (primary)
- [reference/auth.md](reference/auth.md) — API keys per host
- [reference/api.md](reference/api.md) — REST contract (MCP + scripts)
- [reference/scores.md](reference/scores.md) — score fields
