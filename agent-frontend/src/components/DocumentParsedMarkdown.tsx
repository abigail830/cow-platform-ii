import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Components } from 'react-markdown';
import { presignDocumentMarkdownImages } from '../api/documents.ts';
import { markdownImageSrcStorageCandidates } from '../shared/markdown-images.ts';
import { Markdown } from './Markdown.tsx';

type DocumentParsedMarkdownProps = {
  documentId: string;
  content: string;
  headingIds?: boolean;
};

function resolveImageUrl(src: string, urlByStoragePath: ReadonlyMap<string, string>): string | undefined {
  for (const storagePath of markdownImageSrcStorageCandidates(src)) {
    const url = urlByStoragePath.get(storagePath);
    if (url) return url;
  }
  return undefined;
}

export function DocumentParsedMarkdown({
  documentId,
  content,
  headingIds = false,
}: DocumentParsedMarkdownProps) {
  const [urlByStoragePath, setUrlByStoragePath] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    void presignDocumentMarkdownImages(documentId, content).then((map) => {
      if (!cancelled) setUrlByStoragePath(map);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, content]);

  const remintImage = useCallback(
    async (src: string) => {
      const paths = markdownImageSrcStorageCandidates(src);
      if (paths.length === 0) return;
      const map = await presignDocumentMarkdownImages(documentId, content);
      if (map.size === 0) return;
      setUrlByStoragePath((current) => {
        const next = new Map(current);
        for (const [path, url] of map) next.set(path, url);
        return next;
      });
    },
    [content, documentId],
  );

  const components = useMemo((): Components => {
    const img = ({ src, alt }: { src?: string; alt?: string }) => {
      if (!src) return null;
      const resolved = resolveImageUrl(src, urlByStoragePath) ?? src;
      return (
        <img
          src={resolved}
          alt={alt ?? ''}
          loading="lazy"
          onError={() => {
            void remintImage(src);
          }}
        />
      );
    };
    return { img };
  }, [remintImage, urlByStoragePath]);

  return <Markdown content={content} headingIds={headingIds} components={components} />;
}
