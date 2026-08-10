import { Suspense } from 'react';
import { Loader2, X } from 'lucide-react';
import { lazyWithRetry } from '../shared/lazy-with-retry.ts';
import { AsyncModuleBoundary } from './AsyncModuleBoundary.tsx';
import { iconProps } from './icons/icon-props.ts';

const DocumentUdocViewer = lazyWithRetry(
  () => import('./DocumentUdocViewer.tsx').then((mod) => ({ default: mod.DocumentUdocViewer })),
  'DocumentUdocViewer',
);

export function SourceOriginalPreviewPanel({
  documentId,
  page,
  title,
  onClose,
}: {
  documentId: string;
  page?: number | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="source-original-preview-panel">
      <header className="source-preview-panel-header">
        <h2 className="source-preview-panel-title">{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
          <X {...iconProps({ size: 16 })} aria-hidden />
        </button>
      </header>
      <div className="source-preview-panel-body">
        <AsyncModuleBoundary message="Failed to load the document viewer.">
          <Suspense
            fallback={
              <div className="document-viewer-loading source-preview-panel-loading" role="status">
                <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
                <span>Preparing viewer…</span>
              </div>
            }
          >
            <DocumentUdocViewer
              key={`${documentId}:${page ?? 0}`}
              documentId={documentId}
              page={page}
            />
          </Suspense>
        </AsyncModuleBoundary>
      </div>
    </div>
  );
}
