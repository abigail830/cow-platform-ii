---
name: kb-pageindex-qa
description: Orchestrate PageIndex knowledge Q&A via the pageindex-search MCP dual-path protocol (document discovery → tree navigation → section read). Use for long-document reasoning over type=page_index knowledge bases—not RAG chunk search.
---

# PageIndex Knowledge Q&A (dual-path)

Answer from PageIndex knowledge bases by discovering documents, then navigating their section trees. **Tool parameters and per-tool workflow live in each MCP tool's description**; follow those when calling tools.

This is **not** hybrid-search / RAG chunk retrieval. Do not treat section reads as vector top-k fragments.

## Tools (Flue names)

| Layer | MCP tools |
|-------|-----------|
| Scope | `mcp__pageindex-search__list_knowledge_bases` |
| L1 discovery | `mcp__pageindex-search__browse_documents`, `mcp__pageindex-search__search_documents`, `mcp__pageindex-search__get_document` |
| L2 in-doc | `mcp__pageindex-search__get_document_structure`, `mcp__pageindex-search__get_section_content` |

Do not use bash, `node scripts/…`, or `read_skill_resource` for retrieval.

## Dual-path protocol

```text
1. list_knowledge_bases → visible_ids only
2. Scope clues (channel/tags/author/date) → browse_documents(facets…)
   else → search_documents(query) / browse_documents(sort=relevance, query)
3. Read cards (abstract, tags, channel_path, toc signals); pick candidate doc(s)
4. get_document → get_document_structure (required for large docs / page_count ≥ 40)
5. Reason over titles/summaries → get_section_content(node_id…)
6. If evidence is thin → other nodes or other docs; cite via source.citation_markdown
```

## Hard rules

- Never hard-code KB/document UUIDs; only use ids from tools in this session.
- Never dump full large documents; respect section max length and `next_hint`.
- Never skip structure on long documents to “just get the markdown”.
- Never invent preview URLs—copy `citation_markdown` verbatim.
- If `visible_ids` is empty, tell the user; do not call other pageindex-search tools.
- Prefer PageIndex for long-doc argumentation; use hybrid-search only when the task is RAG/FAQ chunk retrieval.
