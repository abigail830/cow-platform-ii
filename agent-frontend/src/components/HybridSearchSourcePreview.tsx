import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { fetchDocumentContent, type DocumentContentResponse } from '../api/documents.ts';
import { Markdown } from '../chat/Markdown.tsx';
import { scrollToDocumentTarget } from '../shared/document-deep-link.ts';
import {
  formatSourceLabel,
  supportsUdocViewer,
  type SourcePreviewSelection,
  type SourcePreviewView,
} from '../shared/source-ref.ts';
import { iconProps } from './icons/icon-props.ts';

const DocumentUdocViewer = lazy(() =>
  import('./DocumentUdocViewer.tsx').then((mod) => ({ default: mod.DocumentUdocViewer })),
);

function ParsedSourcePreview({
  documentId,
  locator,
}: {
  documentId: string;
  locator: SourcePreviewSelection['source']['locator'];
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [content, setContent] = useState<DocumentContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setContent(null);

    void fetchDocumentContent(documentId, { timeoutMs: 60_000 })
      .then((docContent) => {
        if (!cancelled) setContent(docContent);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load parsed content');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (loading || !content?.has_markdown) return;
    window.requestAnimationFrame(() =>
      scrollToDocumentTarget(contentRef.current, {
        nodeId: locator?.node_id ?? null,
        line: locator?.line_num ?? null,
        heading: locator?.heading ?? null,
        highlight: true,
      }),
    );
  }, [loading, content, locator]);

  if (loading) {
    return (
      <div className="document-viewer-loading hybrid-search-preview-loading" role="status">
        <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
        <span>Loading parsed content…</span>
      </div>
    );
  }

  if (error) {
    return <p className="error inline">{error}</p>;
  }

  if (!content?.has_markdown || !content.markdown) {
    return <p className="admin-muted">No parsed content for this document.</p>;
  }

  return (
    <div ref={contentRef} className="hybrid-search-preview-parsed-scroll">
      <Markdown content={content.markdown} headingIds />
    </div>
  );
}

export function HybridSearchSourcePreview({
  selection,
  onClose,
  onViewChange,
}: {
  selection: SourcePreviewSelection;
  onClose: () => void;
  onViewChange: (view: SourcePreviewView) => void;
}) {
  const { source, view } = selection;
  const showOriginalTab = supportsUdocViewer(source.file_type);
  const activeView = showOriginalTab ? view : 'parsed';
  const openInDocumentUrl = activeView === 'original' ? source.original_url : source.parsed_url;
  const locator = source.locator;
  const page = locator?.page_num ?? null;
  const searchQuery = locator?.heading ?? null;

  const handleViewTab = useCallback(
    (next: SourcePreviewView) => {
      if (next === view) return;
      onViewChange(next);
    },
    [onViewChange, view],
  );

  return (
    <aside className="hybrid-search-preview-panel" aria-label="Source preview">
      <header className="hybrid-search-preview-header">
        <div className="hybrid-search-preview-header-main">
          <h2 className="hybrid-search-preview-title">{formatSourceLabel(source)}</h2>
          {showOriginalTab ? (
            <div className="document-detail-view-tabs" role="tablist" aria-label="Preview view">
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'original'}
                className={`document-detail-view-tab${activeView === 'original' ? ' active' : ''}`}
                onClick={() => handleViewTab('original')}
              >
                Original
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'parsed'}
                className={`document-detail-view-tab${activeView === 'parsed' ? ' active' : ''}`}
                onClick={() => handleViewTab('parsed')}
              >
                Parsed
              </button>
            </div>
          ) : null}
        </div>
        <div className="hybrid-search-preview-header-actions">
          <Link
            to={openInDocumentUrl}
            className="hybrid-search-preview-open-link"
            title="Open in document page"
          >
            <ExternalLink {...iconProps({ size: 14 })} aria-hidden />
            Open
          </Link>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X {...iconProps({ size: 16 })} aria-hidden />
          </button>
        </div>
      </header>

      <div className="hybrid-search-preview-body">
        {activeView === 'original' && showOriginalTab ? (
          <Suspense
            fallback={
              <div className="document-viewer-loading hybrid-search-preview-loading" role="status">
                <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
                <span>Preparing viewer…</span>
              </div>
            }
          >
            <DocumentUdocViewer
              key={`${source.document_id}:${page ?? 0}`}
              documentId={source.document_id}
              page={page}
              searchQuery={page == null ? searchQuery : null}
            />
          </Suspense>
        ) : (
          <ParsedSourcePreview documentId={source.document_id} locator={locator} />
        )}
      </div>
    </aside>
  );
}
