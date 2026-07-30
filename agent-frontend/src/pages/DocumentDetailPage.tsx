import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  fetchDocumentContent,
  getDocument,
  type DocumentContentResponse,
  type DocumentRecord,
} from '../api/documents.ts';
import { DocumentMetadataBar } from '../components/DocumentMetadataBar.tsx';
import { formatDocumentStatusLabel } from '../components/DocumentPipelineStatus.tsx';
import { PageIndexTreePanel, slugifyHeading, type PageIndexNode, type PageIndexTree } from '../components/PageIndexTree.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { Markdown } from '../chat/Markdown.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { useDocumentsOutletContext } from './DocumentsOutletContext.tsx';

export function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { setSelectedChannelId } = useDocumentsOutletContext();
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [content, setContent] = useState<DocumentContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('document-detail-split', 32);

  const loadDetail = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError('');
    try {
      const [doc, docContent] = await Promise.all([getDocument(documentId), fetchDocumentContent(documentId)]);
      setDocument(doc);
      setContent(docContent);
      setSelectedChannelId(doc.channel_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
      setDocument(null);
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, [documentId, setSelectedChannelId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!documentId || document?.status !== 'running') return;
    const intervalId = window.setInterval(() => {
      void getDocument(documentId)
        .then((doc) => setDocument(doc))
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [documentId, document?.status]);

  function handleSelectNode(node: PageIndexNode) {
    setActiveNodeId(node.node_id);
    const slug = slugifyHeading(node.title);
    const target =
      (node.node_id
        ? contentRef.current?.querySelector(`#${CSS.escape(node.node_id)}`)
        : null) ??
      contentRef.current?.querySelector(`#${CSS.escape(slug)}`) ??
      (typeof node.line_num === 'number'
        ? contentRef.current?.querySelector(`[data-line="${node.line_num}"]`)
        : null);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const pageIndex = (content?.page_index as PageIndexTree | null) ?? null;

  return (
    <div className="document-detail-page">
      <div className="document-detail-toolbar">
        <Link to="/knowledge/documents" className="document-detail-back">
          <ArrowLeft {...iconProps({ size: 16 })} aria-hidden />
          Back to list
        </Link>
        {document && (
          <div className="document-detail-title-row">
            <h2 className="document-detail-title">{document.name}</h2>
            <span className={`document-status-badge status-${document.status}`}>
              {formatDocumentStatusLabel(document.status)}
            </span>
          </div>
        )}
      </div>

      {error && <p className="error inline">{error}</p>}

      {loading ? (
        <p className="document-detail-loading">Loading document…</p>
      ) : content ? (
        <div className="document-detail-layout">
          <DocumentMetadataBar metadata={content.metadata} />

          <div
            ref={containerRef}
            className="document-detail-split"
            style={{ ['--document-detail-left-pct' as string]: `${leftPct}%` }}
          >
            <aside className="document-detail-pageindex" aria-label="Page index">
              <h3 className="document-detail-panel-heading">Page index</h3>
              <PageIndexTreePanel
                tree={pageIndex}
                activeNodeId={activeNodeId}
                onSelectNode={handleSelectNode}
              />
            </aside>

            <div
              className="document-detail-split-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              onMouseDown={onHandleMouseDown}
            />

            <section className="document-detail-content" aria-label="Document content">
              <h3 className="document-detail-panel-heading">Document text</h3>
              <div ref={contentRef} className="document-detail-content-scroll">
                {content.has_markdown && content.markdown ? (
                  <Markdown content={content.markdown} headingIds />
                ) : (
                  <div className="document-detail-panel-empty">
                    <p>No parsed content yet.</p>
                    <p className="document-detail-panel-hint">
                      Run the pipeline on this document to generate markdown.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
