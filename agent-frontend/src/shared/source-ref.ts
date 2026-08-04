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
  source_type: 'chunk' | 'faq';
  locator: SourceLocator | null;
  parsed_url: string;
  original_url: string;
  preview_url?: string;
  citation_markdown?: string;
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

export function resolveSourcePreviewUrl(source: SourceRef): string {
  if (source.preview_url) return source.preview_url;
  return supportsUdocViewer(source.file_type) ? source.original_url : source.parsed_url;
}

export function formatSourceLabel(source: SourceRef): string {
  const parts = [source.document_name];
  if (source.chunk_index != null) parts.push(`chunk #${source.chunk_index}`);
  const locator = source.locator;
  if (locator?.page_num != null) parts.push(`p.${locator.page_num}`);
  return parts.join(' · ');
}

export type SourcePreviewView = 'original' | 'parsed';

export type SourcePreviewSelection = {
  source: SourceRef;
  view: SourcePreviewView;
};

export function defaultSourcePreviewView(source: SourceRef): SourcePreviewView {
  return supportsUdocViewer(source.file_type) ? 'original' : 'parsed';
}

export function sourcePreviewKey(source: SourceRef, view: SourcePreviewView): string {
  return `${source.document_id}:${view}`;
}
