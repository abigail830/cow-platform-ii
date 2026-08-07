---
name: kb-qa
description: Orchestrate Knowledge Q&A using hybrid-search and web-search MCP tools. Use when answering from organizational knowledge bases or supplementing with public web retrieval.
---

# Knowledge Q&A (MCP orchestration)

This agent answers questions—not document dumps. **Tool parameters and per-tool workflow live in each MCP tool's description**; follow those when calling tools.

## Tools (Flue names)

| Source | MCP tools |
|--------|-----------|
| Knowledge bases | `mcp__hybrid-search__list_knowledge_bases`, `mcp__hybrid-search__hybrid_search` |
| Web supplement | `mcp__zhipu-web-search__web_search_prime` |

Do not use bash, `node scripts/…`, or `read_skill_resource` for retrieval.

## Combined workflow

1. **Choose retrieval mode**
   - Short-fact / FAQ / chunk-style recall → **hybrid-search** (this skill).
   - Long-document argumentation / chapter navigation → **pageindex-search** + skill `kb-pageindex-qa` (separate MCP).
2. **Knowledge base first** — hybrid-search MCP (see tool descriptions for list → search order and query formulation).
3. **Web only when needed** — after judging KB results: empty, weakly related, or likely stale for time-sensitive topics. Not on every turn.
4. **Synthesize** — answer the user's intent in your own words; cite only evidence you used (KB names/sources; web title + URL).

Separate sections when mixing sources (e.g. web supplement labeled as unverified by KB). Do not present model knowledge as organizational fact.
