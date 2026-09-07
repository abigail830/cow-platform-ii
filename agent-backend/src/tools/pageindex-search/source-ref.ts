export type SourceLocator = {
  page_num?: number;
  line_num?: number;
  node_id?: string;
  heading?: string;
};

export type PageIndexSourceRef = {
  document_id: string;
  document_name: string;
  file_type: string | null;
  knowledge_base_id: string;
  source_type: 'page_index';
  locator: SourceLocator | null;
  parsed_url: string;
  preview_url: string;
  /** Ready-to-paste markdown citation for agent answers. */
  citation_markdown: string;
};

export function buildCitationMarkdown(documentName: string, previewUrl: string): string {
  const escaped = documentName.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  return `[${escaped}](${previewUrl})`;
}

function buildParsedPreviewUrl(documentId: string, locator: SourceLocator | null): string {
  const params = new URLSearchParams();
  params.set('view', 'parsed');
  if (locator?.node_id) params.set('node', locator.node_id);
  if (locator?.line_num != null) params.set('line', String(locator.line_num));
  if (locator?.page_num != null) params.set('page', String(locator.page_num));
  if (locator?.heading) params.set('heading', locator.heading);
  return `/knowledge/documents/${documentId}?${params.toString()}`;
}

export function buildPageIndexSourceRef(input: {
  knowledgeBaseId: string;
  documentId: string;
  documentName: string | null | undefined;
  fileType?: string | null;
  locator?: SourceLocator | null;
}): PageIndexSourceRef {
  const documentName = input.documentName?.trim() || 'Document';
  const locator = input.locator ?? null;
  const previewUrl = buildParsedPreviewUrl(input.documentId, locator);

  return {
    document_id: input.documentId,
    document_name: documentName,
    file_type: input.fileType ?? null,
    knowledge_base_id: input.knowledgeBaseId,
    source_type: 'page_index',
    locator,
    parsed_url: previewUrl,
    preview_url: previewUrl,
    citation_markdown: buildCitationMarkdown(documentName, previewUrl),
  };
}
