import type {
  BrowseDocumentsRequest,
  BrowseDocumentsResponse,
  PageIndexDocumentCard,
  PageIndexKnowledgeBase,
} from './types.ts';

export type PageIndexItemRecord = {
  id: string;
  knowledgeBaseId: string;
  documentId: string;
  documentName: string;
  channelPath: string;
  originalS3Key: string;
  metadata: Record<string, unknown> | null;
  pageIndex: Record<string, unknown> | null;
  markdown: string | null;
  parsingResult: Record<string, unknown> | null;
  tocTitles: string[] | null;
  pageCount: number | null;
  pageIndexStrategy: string | null;
  markdownComplete: boolean;
  updatedAt: Date;
  fileType: string | null;
};

export interface PageIndexItemStore {
  listPageIndexKnowledgeBases(ids?: string[]): Promise<PageIndexKnowledgeBase[]>;
  browseDocuments(input: BrowseDocumentsRequest): Promise<BrowseDocumentsResponse>;
  getItem(kbId: string, documentId: string): Promise<PageIndexItemRecord | null>;
  getItemByDocumentId(documentId: string): Promise<PageIndexItemRecord | null>;
}

export type PageIndexSearchDeps = {
  itemStore: PageIndexItemStore;
  readMarkdownFromStorage?: (originalS3Key: string) => Promise<string | null>;
};

export type { PageIndexDocumentCard };
