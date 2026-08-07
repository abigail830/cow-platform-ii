export { createPageIndexSearchService } from './service.ts';
export {
  createDefaultPageIndexSearchDeps,
  createDefaultPageIndexSearchService,
} from './default-deps.ts';
export type { PageIndexSearchService } from './service.ts';
export { createPageIndexSearchMcpHandlers } from './mcp-handlers.ts';
export type { PageIndexSearchMcpHandlers, PageIndexSearchMcpAuth } from './mcp-handlers.ts';
export {
  LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION,
  BROWSE_DOCUMENTS_MCP_DESCRIPTION,
  SEARCH_DOCUMENTS_MCP_DESCRIPTION,
  GET_DOCUMENT_MCP_DESCRIPTION,
  GET_DOCUMENT_STRUCTURE_MCP_DESCRIPTION,
  GET_SECTION_CONTENT_MCP_DESCRIPTION,
} from './mcp-tool-descriptions.ts';
export { buildPageIndexSourceRef, buildCitationMarkdown } from './source-ref.ts';
export type { PageIndexSourceRef, SourceLocator } from './source-ref.ts';
export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DEFAULT_SECTION_MAX_CHARS,
  LARGE_DOC_PAGE_HINT,
  PAGEINDEX_SEARCH_RESOURCE,
} from './constants.ts';
export type {
  PageIndexDocumentCard,
  PageIndexKnowledgeBase,
  BrowseDocumentsRequest,
  BrowseDocumentsResponse,
  PageIndexDocumentDetail,
  DocumentStructureResponse,
  SectionContentResponse,
} from './types.ts';
export type { PageIndexItemStore, PageIndexSearchDeps } from './ports.ts';
export {
  buildDiscoveryText,
  flattenTocTitles,
  materializeDiscoveryFields,
} from './discovery-materialize.ts';
