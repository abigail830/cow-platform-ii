import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Components } from 'react-markdown';
import { apiUrl } from '../api/base.ts';
import { presignDocumentMarkdownImages } from '../api/documents.ts';
import {
  fallbackMarkdownImageSrc,
  resolveDocumentMarkdownFetchUrl,
} from '../shared/markdown-images.ts';
import { Markdown } from './Markdown.tsx';

type DocumentParsedMarkdownProps = {
  documentId: string;
  content: string;
  headingIds?: boolean;
};

const MAX_IMAGE_REMINT_ATTEMPTS = 1;

function ParsedMarkdownImage({
  src,
  alt,
  urlByStoragePath,
  onRemint,
}: {
  src: string;
  alt?: string;
  urlByStoragePath: ReadonlyMap<string, string>;
  onRemint: () => void;
}) {
  const fetchUrl = resolveDocumentMarkdownFetchUrl(src, urlByStoragePath, alt);
  const displaySrc = fetchUrl ?? fallbackMarkdownImageSrc(src, apiUrl);
  const errorAttemptsRef = useRef(0);

  useEffect(() => {
    errorAttemptsRef.current = 0;
  }, [displaySrc]);

  return (
    <img
      src={displaySrc}
      alt={alt ?? ''}
      loading="lazy"
      onError={() => {
        if (errorAttemptsRef.current >= MAX_IMAGE_REMINT_ATTEMPTS) return;
        errorAttemptsRef.current += 1;
        onRemint();
      }}
    />
  );
}

export function DocumentParsedMarkdown({
  documentId,
  content,
  headingIds = false,
}: DocumentParsedMarkdownProps) {
  const [urlByStoragePath, setUrlByStoragePath] = useState<Map<string, string>>(() => new Map());
  const [remintVersion, setRemintVersion] = useState(0);
  const hasImageRefs = useMemo(() => /!\[[^\]]*\]\([^)]+\)/.test(content), [content]);

  useEffect(() => {
    if (!hasImageRefs) {
      setUrlByStoragePath(new Map());
      return;
    }

    let cancelled = false;
    void presignDocumentMarkdownImages(documentId, content).then((lookup) => {
      if (!cancelled) setUrlByStoragePath(lookup);
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
      return (
        <ParsedMarkdownImage
          src={src}
          alt={alt}
          urlByStoragePath={urlByStoragePath}
          onRemint={remintImages}
        />
      );
    };
    return { img };
  }, [remintImages, urlByStoragePath]);

  return <Markdown content={content} headingIds={headingIds} components={components} />;
}
