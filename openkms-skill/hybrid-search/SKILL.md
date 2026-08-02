---
name: hybrid-search
description: Retrieve grounded passages from OpenKMS knowledge bases via hybrid search (dense embeddings + BM25 + RRF, optional rerank). Requires OPENKMS_API_URL and OPENKMS_API_KEY. Never use internal-api or login passwords.
---

# Hybrid Search

Cross–knowledge-base retrieval over **RAG** and **FAQ** bases readable by the current API key (owner + share ACL).

## Prerequisites

| Variable | Purpose |
|----------|---------|
| `OPENKMS_API_URL` | Backend base URL (no trailing slash) |
| `OPENKMS_API_KEY` | Personal API key (`okf_…`) from platform **Settings → API keys** |

How credentials are injected depends on the host (env vars, platform sandbox, or UI-stored key). See [reference/auth.md](reference/auth.md). **Never** print, log, or pass the key via `curl` headers.

Do **not** read or write `/api/hybrid-search/preferences` (UI-only).

## When to use

- You need fresh evidence from KBs before answering.
- Prior retrieval no longer matches the user's refined or shifted question.
- The user names or implies a knowledge-base scope you must verify against the ACL-filtered list.

## Workflow

1. **List** — run `scripts/list_knowledge_bases.mjs`. This output is the **only** authoritative KB list; never hard-code UUIDs from chat.
2. **Scope** — if the user names a KB, match `name` in the list; otherwise use all listed IDs unless intent clearly targets one type (FAQ vs RAG).
3. **Search** — run `scripts/hybrid_search.mjs` with a **retrieval query** (standalone, context-complete—not necessarily the user's raw last message). Defaults: `top_k=10`, `search_type=all`, `bm25_enabled=true`, `rrf_k=60`, `recall_k=25`. Override rerank only when multiple embedding groups require it (`--rerank-model-id`).
4. **Answer** — cite `knowledge_base_name`, `source_name`, `chunk_index`, and `source_type` for claims drawn from results. Do not invent sources.

## Running scripts

Node **18+** required (`fetch` built-in). All scripts are `.mjs` under this skill directory; shared HTTP client: `../../shared/_client.mjs`.

From the **skill root**:

```bash
node scripts/list_knowledge_bases.mjs
node scripts/hybrid_search.mjs --query "standalone retrieval query"
```

Optional flags: `--kb-ids id1,id2`, `--top-k N`, `--search-type all|chunks|faqs`, `--no-bm25`, `--rerank-model-id UUID`, `--pretty`.

### Platform kb-qa sandbox

When this skill is mounted in the OKF kb-qa agent workspace (`cwd` `/home/user/kb-qa`):

```bash
cd skills/hybrid-search
node scripts/list_knowledge_bases.mjs
node scripts/hybrid_search.mjs --query "…"
```

Credentials are pre-injected—do not probe `OPENKMS_API_KEY` with `echo`, `env`, or `curl`.

### External host agents

Copy or link this skill into the host's skill path, set both env vars, and run the same commands from the skill root. Do **not** call the HTTP API directly unless you replicate the scripts' auth and ACL checks.

## Security and efficiency

- Use the scripts only—do **not** `read` / `read_skill_resource` on `reference/`, `shared/`, or `scripts/` during normal retrieval (wastes steps; packaged relative paths often fail).
- Do **not** `curl` hybrid-search endpoints or construct `Authorization` headers manually.
- `--kb-ids` must be a subset of listed IDs; script exits `2` on 403.
- Empty list → tell the user no searchable KBs are visible.

## Reference

- [reference/auth.md](reference/auth.md) — API key setup per host
- [reference/api.md](reference/api.md) — HTTP contract (implemented by scripts)
- [reference/scores.md](reference/scores.md) — score field meanings
