import type { PageIndexSourceRef, SourceLocator } from './source-ref.ts';

export type PageIndexKnowledgeBase = {
  id: string;
  name: string;
  type: 'page_index';
  description: string | null;
  updated_at: string;
};

export type PageIndexDocumentCard = {
  id: string;
  document_id: string;
  knowledge_base_id: string;
  document_name: string;
  channel_path: string;
  abstract: string | null;
  tags: string[];
  categories: string[];
  author: string | null;
  source: string | null;
  publish_date: string | null;
  page_count: number | null;
  page_index_strategy: string | null;
  markdown_complete: boolean;
  updated_at: string;
  rank?: number;
};

export type BrowseSort = 'time' | 'relevance';

export type BrowseDocumentsRequest = {
  kbIds: string[];
  channelPathPrefix?: string;
  tags?: string[];
  categories?: string[];
  author?: string;
  source?: string;
  publishDateFrom?: string;
  publishDateTo?: string;
  query?: string;
  sort: BrowseSort;
  limit: number;
  offset: number;
};

export type BrowseDocumentsResponse = {
  items: PageIndexDocumentCard[];
  limit: number;
  offset: number;
  sort: BrowseSort;
  query: string | null;
};

export type PageIndexDocumentDetail = PageIndexDocumentCard & {
  metadata: Record<string, unknown> | null;
  original_s3_key: string;
  has_page_index: boolean;
  has_markdown: boolean;
  toc_titles: string[];
  citation: PageIndexSourceRef;
};

export type DocumentStructureOptions = {
  maxDepth?: number;
  part?: string;
};

export type DocumentStructureResponse = {
  document_id: string;
  knowledge_base_id: string;
  document_name: string;
  strategy: string | null;
  page_count: number | null;
  max_depth: number | null;
  part: string | null;
  structure: unknown;
  large_doc_hint: string | null;
};

export type SectionPagesRange = {
  start: number;
  end?: number;
};

export type SectionLinesRange = {
  start: number;
  end?: number;
};

export type SectionContentOptions = {
  nodeId?: string;
  pages?: SectionPagesRange;
  lines?: SectionLinesRange;
  maxChars?: number;
};

export type SectionContentResponse = {
  document_id: string;
  knowledge_base_id: string;
  document_name: string;
  content: string;
  locator: SourceLocator | null;
  truncated: boolean;
  next_hint: string | null;
  source: PageIndexSourceRef;
};

export type { SourceLocator, PageIndexSourceRef };
