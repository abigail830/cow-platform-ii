import { Suspense, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { getEvalDatasetItemDownloadUrl, type EvalDatasetItem } from '../api/evaluation/datasets.ts';
import { lazyWithRetry } from '../shared/lazy-with-retry.ts';
import { supportsUdocViewer } from '../shared/source-ref.ts';
import { AsyncModuleBoundary } from './AsyncModuleBoundary.tsx';
import { SourcePreviewDrawer } from './SourcePreviewDrawer.tsx';
import { iconProps } from './icons/icon-props.ts';

const EvalDatasetFileUdocViewer = lazyWithRetry(
  () =>
    import('./EvalDatasetFileUdocViewer.tsx').then((mod) => ({
      default: mod.EvalDatasetFileUdocViewer,
    })),
  'EvalDatasetFileUdocViewer',
);

type EvalDatasetItemPreviewDrawerProps = {
  datasetId: string;
  item: EvalDatasetItem | null;
  onClose: () => void;
};

export function EvalDatasetItemPreviewDrawer({
  datasetId,
  item,
  onClose,
}: EvalDatasetItemPreviewDrawerProps) {
  const [fetchUrl, setFetchUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) {
      setFetchUrl(null);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setFetchUrl(null);

    void getEvalDatasetItemDownloadUrl(datasetId, item.id)
      .then(({ download_url }) => {
        if (!cancelled) setFetchUrl(download_url);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load preview URL');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, item?.id]);

  if (!item) return null;

  const canPreview = supportsUdocViewer(item.file_type);

  return (
    <SourcePreviewDrawer open onClose={onClose}>
      <div className="source-original-preview-panel">
        <header className="source-preview-panel-header">
          <h2 className="source-preview-panel-title">{item.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
            <X {...iconProps({ size: 16 })} aria-hidden />
          </button>
        </header>
        <div className="source-preview-panel-body">
          {error ? <p className="admin-error">{error}</p> : null}
          {loading ? (
            <div className="document-viewer-loading source-preview-panel-loading" role="status">
              <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
              <span>Preparing preview…</span>
            </div>
          ) : null}
          {!loading && !error && fetchUrl && canPreview ? (
            <AsyncModuleBoundary message="Failed to load the document viewer.">
              <Suspense
                fallback={
                  <div className="document-viewer-loading source-preview-panel-loading" role="status">
                    <Loader2
                      {...iconProps({ size: 18, className: 'document-detail-loading-icon' })}
                      aria-hidden
                    />
                    <span>Preparing viewer…</span>
                  </div>
                }
              >
                <EvalDatasetFileUdocViewer key={fetchUrl} fetchUrl={fetchUrl} />
              </Suspense>
            </AsyncModuleBoundary>
          ) : null}
          {!loading && !error && fetchUrl && !canPreview ? (
            <p className="admin-muted">
              Preview is not available for this file type. Use Download to open the file locally.
            </p>
          ) : null}
        </div>
      </div>
    </SourcePreviewDrawer>
  );
}
