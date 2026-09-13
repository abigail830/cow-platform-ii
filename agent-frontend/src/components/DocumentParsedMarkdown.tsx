import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Components } from 'react-markdown';
import { apiUrl } from '../api/base.ts';
import { resolveDocumentMarkdownImageUrls } from '../api/documents.ts';
import { resolveDocumentMarkdownImageUrl } from '../shared/markdown-images.ts';
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
  ticketByPath,
  urlByStoragePath,
  onRemint,
}: {
  src: string;
  alt?: string;
  ticketByPath: ReadonlyMap<string, string>;
  urlByStoragePath: ReadonlyMap<string, string>;
  onRemint: (src: string) => void;
}) {
  const rawResolved = resolveDocumentMarkdownImageUrl(src, ticketByPath, urlByStoragePath, alt);
  const resolved = rawResolved?.startsWith('/api/')
    ? apiUrl(rawResolved)
    : rawResolved;
  const errorAttemptsRef = useRef(0);

  useEffect(() => {
    errorAttemptsRef.current = 0;
  }, [resolved]);

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
        if (errorAttemptsRef.current >= MAX_IMAGE_REMINT_ATTEMPTS) return;
        errorAttemptsRef.current += 1;
        onRemint(src);
      }}
    />
  );
}

export function DocumentParsedMarkdown({
  documentId,
  content,
  headingIds = false,
}: DocumentParsedMarkdownProps) {
  const [ticketByPath, setTicketByPath] = useState<Map<string, string>>(() => new Map());
  const [urlByStoragePath, setUrlByStoragePath] = useState<Map<string, string>>(() => new Map());
  const [remintVersion, setRemintVersion] = useState(0);
  const remintedSrcsRef = useRef<Set<string>>(new Set());
  const hasImageRefs = useMemo(() => /!\[[^\]]*\]\([^)]+\)/.test(content), [content]);

  useEffect(() => {
    remintedSrcsRef.current = new Set();
  }, [content, documentId]);

  useEffect(() => {
    if (!hasImageRefs) {
      setTicketByPath(new Map());
      setUrlByStoragePath(new Map());
      return;
    }

    let cancelled = false;
    void resolveDocumentMarkdownImageUrls(documentId, content).then(({ ticketByPath, urlByStoragePath }) => {
      if (!cancelled) {
        setTicketByPath(ticketByPath);
        setUrlByStoragePath(urlByStoragePath);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [content, documentId, hasImageRefs, remintVersion]);

  const remintImage = useCallback((src: string) => {
    if (remintedSrcsRef.current.has(src)) return;
    remintedSrcsRef.current.add(src);
    setRemintVersion((value) => value + 1);
  }, []);

  const components = useMemo((): Components => {
    const img = ({ src, alt }: { src?: string; alt?: string }) => {
      if (!src) return null;
      return (
        <ParsedMarkdownImage
          src={src}
          alt={alt}
          ticketByPath={ticketByPath}
          urlByStoragePath={urlByStoragePath}
          onRemint={remintImage}
        />
      );
    };
    return { img };
  }, [remintImage, ticketByPath, urlByStoragePath]);

  return <Markdown content={content} headingIds={headingIds} components={components} />;
}
