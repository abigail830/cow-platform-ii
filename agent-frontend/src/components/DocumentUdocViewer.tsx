import { useEffect, useRef, useState } from 'react';
import { UDocClient, type UDocViewer } from '@docmentis/udoc-viewer';
import { Loader2 } from 'lucide-react';
import { getDocumentDownloadUrl } from '../api/documents.ts';
import { iconProps } from './icons/icon-props.ts';

const PAGE_NAV_MAX_MS = 5_000;

function bindViewerPageNavigation(
  viewer: UDocViewer,
  targetPage: number,
  cancelled: () => boolean,
): () => void {
  if (targetPage <= 0) return () => {};

  let disposed = false;
  let rafId = 0;
  let timeoutId = 0;
  const startedAt = performance.now();

  const navigate = () => {
    if (disposed || cancelled()) return;
    viewer.goToPage(targetPage);
  };

  const syncUntilReached = () => {
    if (disposed || cancelled()) return;
    if (viewer.currentPage === targetPage) return;
    if (performance.now() - startedAt > PAGE_NAV_MAX_MS) return;

    navigate();
    rafId = requestAnimationFrame(syncUntilReached);
  };

  const start = () => {
    if (disposed || cancelled()) return;
    cancelAnimationFrame(rafId);
    window.clearTimeout(timeoutId);
    navigate();
    rafId = requestAnimationFrame(syncUntilReached);
  };

  const unsubViewport = viewer.on('viewport:change', () => {
    if (disposed || cancelled()) return;
    if (viewer.currentPage !== targetPage) {
      start();
    }
  });

  const unsubLoad = viewer.isLoaded
    ? null
    : viewer.on('document:load', () => {
        start();
      });

  timeoutId = window.setTimeout(start, 0);

  return () => {
    disposed = true;
    cancelAnimationFrame(rafId);
    window.clearTimeout(timeoutId);
    unsubViewport();
    unsubLoad?.();
  };
}

export function DocumentUdocViewer({
  documentId,
  page,
  searchQuery,
}: {
  documentId: string;
  page?: number | null;
  searchQuery?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<UDocViewer | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let client: UDocClient | null = null;
    let viewer: UDocViewer | null = null;

    async function mount() {
      const container = containerRef.current;
      if (!container) return;
      setLoading(true);
      setError('');

      try {
        const { url } = await getDocumentDownloadUrl(documentId);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch original file (${response.status})`);
        const buffer = await response.arrayBuffer();

        client = await UDocClient.create();
        viewer = await client.createViewer({ container });
        await viewer.load(new Uint8Array(buffer));
        if (!disposed) {
          viewerRef.current = viewer;
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to load original file');
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void mount();

    return () => {
      disposed = true;
      viewer?.destroy();
      client?.destroy();
      viewerRef.current = null;
    };
  }, [documentId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (loading || !viewer) return;

    const cancelled = () => false;
    const targetPage = page ?? 0;
    let cleanupNavigation = () => {};
    let resizeTimer = 0;
    let observer: ResizeObserver | null = null;

    if (targetPage > 0) {
      cleanupNavigation = bindViewerPageNavigation(viewer, targetPage, cancelled);

      const container = containerRef.current;
      if (container) {
        observer = new ResizeObserver(() => {
          window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            if (viewer.currentPage !== targetPage) {
              viewer.goToPage(targetPage);
            }
          }, 80);
        });
        observer.observe(container);
      }
    } else if (searchQuery?.trim()) {
      void viewer.search(searchQuery.trim());
    }

    return () => {
      cleanupNavigation();
      observer?.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, [loading, page, searchQuery]);

  return (
    <div className="document-udoc-viewer">
      <div ref={containerRef} className="document-udoc-viewer-canvas" aria-hidden={loading} />
      {loading ? (
        <div className="document-udoc-viewer-loading document-viewer-loading" role="status">
          <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
          <span>Loading original file…</span>
        </div>
      ) : null}
      {error ? <p className="error inline document-udoc-viewer-error">{error}</p> : null}
    </div>
  );
}
