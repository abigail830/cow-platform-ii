import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../api/base.ts';
import { resolveDocumentMarkdownImageUrls } from '../api/documents.ts';
import { rewriteDocumentMarkdownImageUrls } from '../shared/markdown-images.ts';
import { Markdown } from './Markdown.tsx';

type DocumentParsedMarkdownProps = {
  documentId: string;
  content: string;
  headingIds?: boolean;
};

export function DocumentParsedMarkdown({
  documentId,
  content,
  headingIds = false,
}: DocumentParsedMarkdownProps) {
  const [renderContent, setRenderContent] = useState(content);
  const hasImageRefs = useMemo(() => /!\[[^\]]*\]\([^)]+\)/.test(content), [content]);

  useEffect(() => {
    setRenderContent(content);
  }, [content]);

  useEffect(() => {
    if (!hasImageRefs) return;

    let cancelled = false;
    void resolveDocumentMarkdownImageUrls(documentId, content).then(({ ticketByPath, urlByStoragePath }) => {
      if (cancelled) return;
      setRenderContent(
        rewriteDocumentMarkdownImageUrls(content, ticketByPath, urlByStoragePath, apiUrl),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [content, documentId, hasImageRefs]);

  return <Markdown content={renderContent} headingIds={headingIds} />;
}
