import { useEffect, useRef, useState } from 'react';
import { UDocClient, type UDocViewer } from '@docmentis/udoc-viewer';
import { Loader2 } from 'lucide-react';
import { getDocumentDownloadUrl } from '../api/documents.ts';
import { iconProps } from './icons/icon-props.ts';

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
        viewerRef.current = viewer;

        if (!disposed && page != null && page > 0) {
          viewer.goToPage(page);
        } else if (!disposed && searchQuery?.trim()) {
          await viewer.search(searchQuery.trim());
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
    if (loading || !viewerRef.current || page == null || page <= 0) return;
    viewerRef.current.goToPage(page);
  }, [loading, page]);

  useEffect(() => {
    if (loading || !viewerRef.current || !searchQuery?.trim()) return;
    void viewerRef.current.search(searchQuery.trim());
  }, [loading, searchQuery]);

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
