export const DOCUMENT_ARTIFACT_KINDS = ['markdown', 'page_index'] as const;

export type DocumentArtifactKind = (typeof DOCUMENT_ARTIFACT_KINDS)[number];

const ARTIFACT_FILES: Record<DocumentArtifactKind, { filename: string; contentType: string }> = {
  markdown: { filename: 'markdown.md', contentType: 'text/markdown' },
  page_index: { filename: 'page_index.json', contentType: 'application/json' },
};

export function parseDocumentArtifactKind(value: unknown): DocumentArtifactKind {
  if (value === 'markdown' || value === 'page_index') return value;
  throw new Error('artifact must be markdown or page_index');
}

export function documentArtifactFile(kind: DocumentArtifactKind): { filename: string; contentType: string } {
  return ARTIFACT_FILES[kind];
}

export function prefixFromDocumentS3Key(s3Key: string): string {
  const normalized = s3Key.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

export function buildDocumentArtifactKey(documentS3Key: string, kind: DocumentArtifactKind): string {
  return `${prefixFromDocumentS3Key(documentS3Key)}/${documentArtifactFile(kind).filename}`;
}

export function assertDocumentArtifactS3Key(
  documentS3Key: string,
  kind: DocumentArtifactKind,
  s3Key: string,
): string {
  const expected = buildDocumentArtifactKey(documentS3Key, kind);
  if (s3Key !== expected) {
    throw new Error('s3_key does not match the document artifact');
  }
  return expected;
}
