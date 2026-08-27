import {
  readStorageText,
  storagePrefixFromS3Key,
} from '../storage/document-content.ts';
import { isServerlessRuntime } from '../services/pipeline/pipeline-worker-mode.ts';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SECTION_MAX_CHARS,
  LARGE_DOC_PAGE_HINT,
  MAX_PAGE_SIZE,
} from './constants.ts';
import {
  findSubtree,
  sliceByLines,
  sliceByNodeId,
  sliceByPages,
  trimStructure,
} from './core/section-slice.ts';
import type { PageIndexSearchDeps } from './ports.ts';
import { buildPageIndexSourceRef } from './source-ref.ts';
import type {
  BrowseDocumentsRequest,
  BrowseSort,
  DocumentStructureOptions,
  DocumentStructureResponse,
  PageIndexDocumentDetail,
  SectionContentOptions,
  SectionContentResponse,
} from './types.ts';

function clampPageSize(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

function clampOffset(offset?: number): number {
  if (offset == null || !Number.isFinite(offset) || offset < 0) return 0;
  return Math.trunc(offset);
}

export async function defaultReadMarkdownFromStorage(originalS3Key: string): Promise<string | null> {
  if (isServerlessRuntime()) return null;
  const prefix = storagePrefixFromS3Key(originalS3Key);
  return readStorageText(`${prefix}/markdown.md`);
}

export function createPageIndexSearchService(deps: PageIndexSearchDeps) {
  async function resolveMarkdown(item: {
    markdown: string | null;
    markdownComplete: boolean;
    originalS3Key: string;
    documentId: string;
  }): Promise<string> {
    if (item.markdown && item.markdownComplete) {
      return item.markdown;
    }
    if (item.markdown && !item.markdownComplete) {
      // Prefer complete S3 copy when DB column is marked incomplete.
      const fromStorage = deps.readMarkdownFromStorage
        ? await deps.readMarkdownFromStorage(item.originalS3Key)
        : null;
      if (fromStorage) return fromStorage;
      if (item.markdown) return item.markdown;
    }
    if (!item.markdown) {
      const fromStorage = deps.readMarkdownFromStorage
        ? await deps.readMarkdownFromStorage(item.originalS3Key)
        : null;
      if (fromStorage) return fromStorage;
    }
    throw new Error(
      `Markdown content unavailable for document ${item.documentId}. ` +
        `DB markdown is missing/incomplete and S3 fallback (${storagePrefixFromS3Key(item.originalS3Key)}/markdown.md) failed.`,
    );
  }

  return {
    listKnowledgeBases(visibleIds?: string[]) {
      return deps.itemStore.listPageIndexKnowledgeBases(visibleIds);
    },

    browseDocuments(
      input: Omit<BrowseDocumentsRequest, 'limit' | 'offset' | 'sort'> & {
        limit?: number;
        offset?: number;
        sort?: BrowseSort;
      },
    ) {
      const sort: BrowseSort = input.sort ?? (input.query?.trim() ? 'relevance' : 'time');
      return deps.itemStore.browseDocuments({
        ...input,
        sort,
        limit: clampPageSize(input.limit),
        offset: clampOffset(input.offset),
      });
    },

    searchDocuments(
      input: Omit<BrowseDocumentsRequest, 'limit' | 'offset' | 'sort' | 'query'> & {
        query: string;
        limit?: number;
        offset?: number;
      },
    ) {
      const query = input.query.trim();
      if (!query) {
        throw new Error('query is required for search_documents');
      }
      return deps.itemStore.browseDocuments({
        ...input,
        query,
        sort: 'relevance',
        limit: clampPageSize(input.limit),
        offset: clampOffset(input.offset),
      });
    },

    async getDocument(
      kbId: string,
      documentId: string,
      visibleIds?: Iterable<string>,
    ): Promise<PageIndexDocumentDetail> {
      if (visibleIds) {
        const allowed = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
        if (!allowed.has(kbId)) {
          throw new Error(`Knowledge base not visible: ${kbId}`);
        }
      }
      const item = await deps.itemStore.getItem(kbId, documentId);
      if (!item) {
        throw new Error(`Document not found in knowledge base: ${documentId}`);
      }
      const meta = item.metadata ?? {};
      const citation = buildPageIndexSourceRef({
        knowledgeBaseId: item.knowledgeBaseId,
        documentId: item.documentId,
        documentName: item.documentName,
        fileType: item.fileType,
      });
      return {
        id: item.id,
        document_id: item.documentId,
        knowledge_base_id: item.knowledgeBaseId,
        document_name: item.documentName,
        channel_path: item.channelPath,
        abstract: typeof meta.abstract === 'string' ? meta.abstract : null,
        tags: Array.isArray(meta.tags)
          ? meta.tags.filter((t): t is string => typeof t === 'string')
          : [],
        categories: Array.isArray(meta.categories)
          ? meta.categories.filter((t): t is string => typeof t === 'string')
          : [],
        author: typeof meta.author === 'string' ? meta.author : null,
        source: typeof meta.source === 'string' ? meta.source : null,
        publish_date: typeof meta.publish_date === 'string' ? meta.publish_date : null,
        page_count: item.pageCount,
        page_index_strategy: item.pageIndexStrategy,
        markdown_complete: item.markdownComplete,
        updated_at: item.updatedAt.toISOString(),
        metadata: item.metadata,
        original_s3_key: item.originalS3Key,
        has_page_index: item.pageIndex != null,
        has_markdown: Boolean(item.markdown) || !item.markdownComplete,
        toc_titles: item.tocTitles ?? [],
        citation,
      };
    },

    async getDocumentStructure(
      kbId: string,
      documentId: string,
      options: DocumentStructureOptions = {},
    ): Promise<DocumentStructureResponse> {
      const item = await deps.itemStore.getItem(kbId, documentId);
      if (!item) {
        throw new Error(`Document not found in knowledge base: ${documentId}`);
      }
      if (!item.pageIndex) {
        throw new Error(`Document ${documentId} has no page_index structure`);
      }

      let structure: unknown = item.pageIndex.structure ?? item.pageIndex;
      if (options.part?.trim()) {
        const subtree = findSubtree(structure, options.part.trim());
        if (!subtree) {
          throw new Error(`Structure part not found: ${options.part}`);
        }
        structure = subtree;
      }

      const maxDepth = options.maxDepth;
      if (maxDepth != null) {
        structure = trimStructure(structure, maxDepth);
      } else {
        structure = trimStructure(structure, Number.POSITIVE_INFINITY);
      }

      const pageCount = item.pageCount;
      const largeDocHint =
        pageCount != null && pageCount >= LARGE_DOC_PAGE_HINT
          ? `Document has ~${pageCount} pages (≥ ${LARGE_DOC_PAGE_HINT}). Prefer structure navigation before requesting large section ranges.`
          : null;

      return {
        document_id: item.documentId,
        knowledge_base_id: item.knowledgeBaseId,
        document_name: item.documentName,
        strategy: item.pageIndexStrategy ?? (typeof item.pageIndex.strategy === 'string' ? item.pageIndex.strategy : null),
        page_count: pageCount,
        max_depth: maxDepth ?? null,
        part: options.part?.trim() || null,
        structure,
        large_doc_hint: largeDocHint,
      };
    },

    async getSectionContent(
      kbId: string,
      documentId: string,
      options: SectionContentOptions = {},
    ): Promise<SectionContentResponse> {
      const item = await deps.itemStore.getItem(kbId, documentId);
      if (!item) {
        throw new Error(`Document not found in knowledge base: ${documentId}`);
      }

      const markdown = await resolveMarkdown(item);
      const maxChars = options.maxChars ?? DEFAULT_SECTION_MAX_CHARS;
      const pageIndex = item.pageIndex;

      let slice;
      if (options.nodeId?.trim()) {
        slice = sliceByNodeId(markdown, pageIndex, options.nodeId.trim(), maxChars);
      } else if (options.lines) {
        slice = sliceByLines(markdown, options.lines.start, options.lines.end, maxChars);
      } else if (options.pages) {
        slice = sliceByPages(
          markdown,
          pageIndex,
          options.pages.start,
          options.pages.end,
          maxChars,
        );
      } else {
        throw new Error('get_section_content requires node_id, pages, or lines');
      }

      if (slice.error) {
        throw new Error(slice.error);
      }

      const source = buildPageIndexSourceRef({
        knowledgeBaseId: item.knowledgeBaseId,
        documentId: item.documentId,
        documentName: item.documentName,
        fileType: item.fileType,
        locator: slice.locator,
      });

      return {
        document_id: item.documentId,
        knowledge_base_id: item.knowledgeBaseId,
        document_name: item.documentName,
        content: slice.content,
        locator: slice.locator,
        truncated: slice.truncated,
        next_hint: slice.next_hint,
        source,
      };
    },
  };
}

export type PageIndexSearchService = ReturnType<typeof createPageIndexSearchService>;
