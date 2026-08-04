import type { HybridSourceType } from './types.ts';

export type SourceLocator = {
  page_num?: number;
  line_num?: number;
  node_id?: string;
  heading?: string;
  char_start?: number;
  char_end?: number;
  sheet_index?: number;
};

export type SourceRef = {
  document_id: string;
  document_name: string;
  file_type: string | null;
  knowledge_base_id: string;
  chunk_id: string;
  chunk_index: number | null;
  source_type: HybridSourceType;
  locator: SourceLocator | null;
  parsed_url: string;
  original_url: string;
};

const UDOC_FILE_TYPES = new Set([
  'PDF',
  'DOCX',
  'XLSX',
  'PPTX',
  'CSV',
  'SVG',
  'PNG',
  'JPG',
  'JPEG',
  'GIF',
  'WEBP',
  'BMP',
  'TIF',
  'TIFF',
]);

export function supportsUdocViewer(fileType: string | null | undefined): boolean {
  if (!fileType) return false;
  return UDOC_FILE_TYPES.has(fileType.toUpperCase());
}

function readLocator(chunkMetadata: Record<string, unknown> | null | undefined): SourceLocator | null {
  if (!chunkMetadata) return null;

  const locator: SourceLocator = {};
  if (typeof chunkMetadata.heading === 'string' && chunkMetadata.heading.trim()) {
    locator.heading = chunkMetadata.heading.trim();
  }
  if (typeof chunkMetadata.node_id === 'string' && chunkMetadata.node_id.trim()) {
    locator.node_id = chunkMetadata.node_id.trim();
  }
  if (typeof chunkMetadata.page_num === 'number' && Number.isFinite(chunkMetadata.page_num)) {
    locator.page_num = Math.trunc(chunkMetadata.page_num);
  }
  if (typeof chunkMetadata.line_num === 'number' && Number.isFinite(chunkMetadata.line_num)) {
    locator.line_num = Math.trunc(chunkMetadata.line_num);
  }
  if (typeof chunkMetadata.sheet_index === 'number' && Number.isFinite(chunkMetadata.sheet_index)) {
    locator.sheet_index = Math.trunc(chunkMetadata.sheet_index);
  }
  if (typeof chunkMetadata.char_start === 'number' && Number.isFinite(chunkMetadata.char_start)) {
    locator.char_start = Math.trunc(chunkMetadata.char_start);
  }
  if (typeof chunkMetadata.char_end === 'number' && Number.isFinite(chunkMetadata.char_end)) {
    locator.char_end = Math.trunc(chunkMetadata.char_end);
  }

  return Object.keys(locator).length > 0 ? locator : null;
}

function buildDocumentUrl(
  documentId: string,
  view: 'parsed' | 'original',
  locator: SourceLocator | null,
  highlight: boolean,
): string {
  const params = new URLSearchParams();
  params.set('view', view);
  if (locator?.node_id) params.set('node', locator.node_id);
  if (locator?.line_num != null) params.set('line', String(locator.line_num));
  if (locator?.page_num != null) params.set('page', String(locator.page_num));
  if (locator?.sheet_index != null) params.set('sheet', String(locator.sheet_index));
  if (locator?.heading) params.set('heading', locator.heading);
  if (highlight) params.set('highlight', '1');
  return `/knowledge/documents/${documentId}?${params.toString()}`;
}

export function buildSourceRef(input: {
  chunkId: string;
  knowledgeBaseId: string;
  sourceType: HybridSourceType;
  documentId: string | null | undefined;
  documentName: string | null | undefined;
  fileType: string | null | undefined;
  chunkIndex: number | null | undefined;
  chunkMetadata: Record<string, unknown> | null | undefined;
}): SourceRef | null {
  if (!input.documentId) return null;

  const locator = readLocator(input.chunkMetadata);
  const documentName = input.documentName?.trim() || 'Document';

  return {
    document_id: input.documentId,
    document_name: documentName,
    file_type: input.fileType ?? null,
    knowledge_base_id: input.knowledgeBaseId,
    chunk_id: input.chunkId,
    chunk_index: input.chunkIndex ?? null,
    source_type: input.sourceType,
    locator,
    parsed_url: buildDocumentUrl(input.documentId, 'parsed', locator, true),
    original_url: buildDocumentUrl(input.documentId, 'original', locator, false),
  };
}
