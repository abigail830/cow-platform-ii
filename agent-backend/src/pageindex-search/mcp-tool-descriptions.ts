/** Shared MCP tool descriptions (HTTP MCP + Flue tool discovery). */

export const LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION = [
  'Authoritative ACL-filtered list of PageIndex knowledge bases (type=page_index) this caller can access (owner + share).',
  'Call before browse/search/get_* when you do not already have valid visible_ids from a recent list in this session, or when the user names/changes KB scope.',
  'Never hard-code KB UUIDs from chat or memory—only use ids returned here.',
  'If visible_ids is empty, tell the user no PageIndex knowledge bases are visible; do not call other tools.',
].join(' ');

export const BROWSE_DOCUMENTS_MCP_DESCRIPTION = [
  'Layer-1 document discovery for PageIndex KBs: facet filters + optional lexical ranking; returns document cards (abstract/tags/TOC signals), never full text.',
  'Prerequisite: list_knowledge_bases (or reuse its visible_ids if scope unchanged). kb_ids must be a subset of visible_ids.',
  'Facets: channel_path_prefix, tags, categories, author, source, publish_date_from/to.',
  'sort=time (default without query) or sort=relevance (requires query). Defaults: limit=20 (max 50).',
  'Dual-path protocol: use facets when the user gives scope clues; otherwise prefer search_documents / browse with relevance query.',
  'Read cards (abstract, tags, channel_path) to pick candidate documents—do not pull full markdown here.',
].join(' ');

export const SEARCH_DOCUMENTS_MCP_DESCRIPTION = [
  'Layer-1 lexical escalation over PageIndex discovery_text (name/channel/abstract/tags/TOC/node summaries) via Postgres FTS.',
  'Prerequisite: list_knowledge_bases. query is required (standalone keywords—rewrite when the user message depends on chat context).',
  'Same facets as browse_documents. Returns ranked document cards with rank; no full text.',
  'Use after browse with time sort missed likely docs, or when the user asks to find documents by topic keywords.',
  'Then continue dual-path: get_document → get_document_structure → get_section_content.',
].join(' ');

export const GET_DOCUMENT_MCP_DESCRIPTION = [
  'Fetch one PageIndex document card plus metadata, page_count, strategy, toc_titles, and citation deep link.',
  'Does not return full markdown. Use to confirm a candidate before structure/section reads.',
  'kb_id and document_id must refer to a visible PageIndex KB item.',
].join(' ');

export const GET_DOCUMENT_STRUCTURE_MCP_DESCRIPTION = [
  'Layer-2 tree navigation: returns trimmed page_index structure (title/summary/prefix_summary/node_id/line_num/page_num/nodes).',
  'For large documents (see large_doc_hint / page_count ≥ 40), ALWAYS call this before requesting broad section ranges.',
  'Optional max_depth limits nesting; optional part zooms into a subtree by node_id.',
  'Reason over titles/summaries to pick node_id(s), then call get_section_content. Do not invent node ids.',
].join(' ');

export const GET_SECTION_CONTENT_MCP_DESCRIPTION = [
  'Layer-2 section read: returns natural section markdown by node_id (preferred), or pages/lines range.',
  'Hard length limit default 12000 chars; when truncated, follow next_hint for continuation.',
  'Hot path reads Postgres markdown; S3 markdown.md is cold fallback when markdown_complete=false or DB markdown missing.',
  'Each response includes source.citation_markdown — copy it verbatim when citing; never invent preview URLs.',
  'Forbidden: dumping entire large documents; skipping get_document_structure on long docs; treating this MCP like hybrid vector chunk search.',
].join(' ');
