/** Shared MCP tool descriptions (HTTP MCP + Flue tool discovery). */

export const LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION = [
  'Authoritative ACL-filtered list of knowledge bases this caller can search (owner + share).',
  'Call before hybrid_search when you do not already have valid visible_ids from a recent list in this session, or when the user names/changes KB scope.',
  'Never hard-code KB UUIDs from chat or memory—only use ids returned here.',
  'If visible_ids is empty, tell the user no searchable knowledge bases are visible; do not call hybrid_search.',
  'Optional group_by_embedding groups results by embedding_model_config_id (useful when mixing embedding models).',
].join(' ');

export const HYBRID_SEARCH_MCP_DESCRIPTION = [
  'Hybrid retrieval over visible knowledge bases (dense + BM25 + RRF, optional rerank).',
  'Call with separate named arguments — never pack them into one JSON string or a single parameter.',
  'Required: query (plain string). Optional: kb_ids (uuid array), top_k (int, default 10), search_type (all|chunks|faqs, default all).',
  'Example: hybrid_search(query="Nexus 存储系统 定义", kb_ids=["<visible uuid>"], top_k=10)',
  'query is the retrieval text itself, not a JSON object. Rewrite follow-ups ("这个", "上面说的") into a full standalone query.',
  'Prerequisite: list_knowledge_bases in this session (or reuse its visible_ids if scope is unchanged). kb_ids must be a subset of those visible_ids; do not invent UUIDs. If visible_ids is empty, do not call this tool.',
  'Cite KB claims by copying source.citation_markdown verbatim — never invent URLs.',
  'If chunk markdown references parsed images (markdown_out/…), call fetch_document_asset with source.document_id and that path.',
].join(' ');
