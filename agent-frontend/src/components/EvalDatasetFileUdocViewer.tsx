import { useEffect, useRef, useState } from 'react';
import { UDocClient, type UDocViewer } from '@docmentis/udoc-viewer';
import { Loader2 } from 'lucide-react';
import { iconProps } from './icons/icon-props.ts';

export function EvalDatasetFileUdocViewer({ fetchUrl }: { fetchUrl: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let client: UDocClient | null = null;
    let viewer: UDocViewer | null = null;

    setLoading(true);
    setError('');

    async function mount() {
      const container = containerRef.current;
      if (!container) return;

      try {
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`Failed to fetch file (${response.status})`);
        const buffer = await response.arrayBuffer();

        client = await UDocClient.create();
        viewer = await client.createViewer({ container });
        await viewer.load(new Uint8Array(buffer));
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
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
    };
  }, [fetchUrl]);

  return (
    <div className="document-udoc-viewer">
      <div ref={containerRef} className="document-udoc-viewer-canvas" aria-hidden={loading} />
      {loading ? (
        <div className="document-udoc-viewer-loading document-viewer-loading" role="status">
          <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
          <span>Loading file…</span>
        </div>
      ) : null}
      {error ? <p className="error inline document-udoc-viewer-error">{error}</p> : null}
    </div>
  );
}
