import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Components } from 'react-markdown';
import { presignDocumentMarkdownImages } from '../api/documents.ts';
import { collectDocumentMarkdownImageStoragePaths, resolvePresignedImageUrl } from '../shared/markdown-images.ts';
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
  const [urlByStoragePath, setUrlByStoragePath] = useState<Map<string, string>>(() => new Map());
  const [remintVersion, setRemintVersion] = useState(0);
  const hasImageRefs = useMemo(
    () => collectDocumentMarkdownImageStoragePaths(content).length > 0,
    [content],
  );

  useEffect(() => {
    if (!hasImageRefs) {
      setUrlByStoragePath(new Map());
      return;
    }

    let cancelled = false;
    void presignDocumentMarkdownImages(documentId, content).then((map) => {
      if (!cancelled) setUrlByStoragePath(map);
    });
    return () => {
      cancelled = true;
    };
  }, [content, documentId, hasImageRefs, remintVersion]);

  const remintImages = useCallback(() => {
    setRemintVersion((value) => value + 1);
  }, []);

  const components = useMemo((): Components => {
    const img = ({ src, alt }: { src?: string; alt?: string }) => {
      if (!src) return null;
      const resolved = resolvePresignedImageUrl(src, urlByStoragePath);
      if (!resolved) {
        return (
          <span className="admin-muted" title="Image artifact missing or unavailable — re-run parse if this persists">
            {alt?.trim() || src.split('/').pop() || 'Image unavailable'}
          </span>
        );
      }
      return (
        <img
          src={resolved}
          alt={alt ?? ''}
          loading="lazy"
          onError={() => {
            remintImages();
          }}
        />
      );
    };
    return { img };
  }, [remintImages, urlByStoragePath]);

  return <Markdown content={content} headingIds={headingIds} components={components} />;
}
