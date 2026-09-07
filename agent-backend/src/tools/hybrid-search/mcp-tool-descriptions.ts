/** Shared MCP tool descriptions (HTTP MCP + Flue tool discovery). */

export const LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION = [
  'Authoritative ACL-filtered list of knowledge bases this caller can search (owner + share).',
  'Call before hybrid_search when you do not already have valid visible_ids from a recent list in this session, or when the user names/changes KB scope.',
  'Never hard-code KB UUIDs from chat or memory—only use ids returned here.',
  'If visible_ids is empty, tell the user no searchable knowledge bases are visible; do not call hybrid_search.',
  'Optional group_by_embedding groups results by embedding_model_config_id (useful when mixing embedding models).',
].join(' ');

export const HYBRID_SEARCH_MCP_DESCRIPTION = [
  'Hybrid retrieval over visible knowledge bases: dense vector + BM25 + RRF fusion, optional rerank.',
  'Prerequisite: call list_knowledge_bases in this session (or reuse its visible_ids if scope unchanged).',
  'query must be a standalone retrieval query—rewrite when the user message depends on context ("这个", "上面说的", short follow-ups).',
  'kb_ids must be a subset of visible_ids from list_knowledge_bases; forbidden ids error.',
  'Defaults: top_k=10, search_type=all (chunks+faqs), BM25 enabled, rrf_k=60, recall_k=25.',
  'search_type: all | chunks (RAG) | faqs. no_bm25 disables the BM25 leg. rerank_model_id optional.',
  'Each result includes source { document_name, preview_url, citation_markdown, parsed_url, original_url, locator, chunk_index }.',
  'Cite KB claims by copying source.citation_markdown verbatim into your answer—never invent URLs or use placeholders like preview_url.',
].join(' ');
