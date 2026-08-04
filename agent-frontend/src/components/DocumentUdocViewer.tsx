import { useEffect, useRef, useState } from 'react';
import { UDocClient, type UDocViewer } from '@docmentis/udoc-viewer';
import { Loader2 } from 'lucide-react';
import { getDocumentDownloadUrl } from '../api/documents.ts';
import { iconProps } from './icons/icon-props.ts';

const PAGE_NAV_GUARD_MS = 8_000;
const PAGE_NAV_RETRY_MS = 120;

function navigateToViewerPage(viewer: UDocViewer, targetPage: number): void {
  if (targetPage <= 0) return;

  try {
    viewer.goToDestination({
      pageIndex: targetPage - 1,
      display: { type: 'fit' },
    });
  } catch {
    viewer.goToPage(targetPage);
  }
}

function bindViewerPageNavigation(
  viewer: UDocViewer,
  targetPage: number,
  cancelled: () => boolean,
): () => void {
  if (targetPage <= 0) return () => {};

  let disposed = false;
  let retryTimer = 0;
  const guardUntil = performance.now() + PAGE_NAV_GUARD_MS;

  const navigate = () => {
    if (disposed || cancelled()) return;
    navigateToViewerPage(viewer, targetPage);
  };

  const scheduleNavigate = (delayMs = PAGE_NAV_RETRY_MS) => {
    if (disposed || cancelled()) return;
    if (performance.now() > guardUntil) return;
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(navigate, delayMs);
  };

  const unsubViewport = viewer.on('viewport:change', () => {
    if (disposed || cancelled()) return;
    if (viewer.currentPage !== targetPage) {
      scheduleNavigate();
    }
  });

  const unsubPageChange = viewer.on('page:change', ({ page }) => {
    if (disposed || cancelled()) return;
    if (page !== targetPage) {
      // Udoc restores scroll position on resize and can reset page to 1 — re-apply after its layout pass.
      scheduleNavigate();
    }
  });

  const unsubLoad = viewer.isLoaded
    ? null
    : viewer.on('document:load', () => {
        scheduleNavigate(0);
      });

  scheduleNavigate(0);

  return () => {
    disposed = true;
    window.clearTimeout(retryTimer);
    unsubViewport();
    unsubPageChange();
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewerInstance, setViewerInstance] = useState<UDocViewer | null>(null);

  useEffect(() => {
    let disposed = false;
    let client: UDocClient | null = null;
    let viewer: UDocViewer | null = null;

    setViewerInstance(null);
    setLoading(true);
    setError('');

    async function mount() {
      const container = containerRef.current;
      if (!container) return;

      try {
        const { url } = await getDocumentDownloadUrl(documentId);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch original file (${response.status})`);
        const buffer = await response.arrayBuffer();

        client = await UDocClient.create();
        viewer = await client.createViewer({ container });
        await viewer.load(new Uint8Array(buffer));
        if (!disposed) {
          setViewerInstance(viewer);
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
      setViewerInstance(null);
    };
  }, [documentId]);

  useEffect(() => {
    if (loading || !viewerInstance) return;

    const cancelled = () => false;
    const targetPage = page ?? 0;
    let cleanupNavigation = () => {};
    let resizeTimer = 0;
    let observer: ResizeObserver | null = null;

    if (targetPage > 0) {
      cleanupNavigation = bindViewerPageNavigation(viewerInstance, targetPage, cancelled);

      const container = containerRef.current;
      if (container) {
        observer = new ResizeObserver(() => {
          window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            if (viewerInstance.currentPage !== targetPage) {
              navigateToViewerPage(viewerInstance, targetPage);
            }
          }, PAGE_NAV_RETRY_MS);
        });
        observer.observe(container);
      }
    } else if (searchQuery?.trim()) {
      void viewerInstance.search(searchQuery.trim());
    }

    return () => {
      cleanupNavigation();
      observer?.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, [loading, viewerInstance, page, searchQuery]);

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
