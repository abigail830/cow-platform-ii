import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  fetchDocumentContent,
  getDocument,
  type DocumentContentResponse,
  type DocumentRecord,
} from '../api/documents.ts';
import { DocumentMetadataBar } from '../components/DocumentMetadataBar.tsx';
import { MindmapMetadataPanel, parseMindmapParsingResult } from '../components/MindmapMetadataPanel.tsx';
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
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [loadingContent, setLoadingContent] = useState(true);
  const [error, setError] = useState('');
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number | null>(null);

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('document-detail-split', 32);

  const loadDetail = useCallback(async () => {
    if (!documentId) return;
    setLoadingDoc(true);
    setLoadingContent(true);
    setError('');
    setContent(null);

    try {
      const doc = await getDocument(documentId);
      setDocument(doc);
      setSelectedChannelId(doc.channel_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
      setDocument(null);
      setLoadingContent(false);
      return;
    } finally {
      setLoadingDoc(false);
    }

    try {
      const docContent = await fetchDocumentContent(documentId, { timeoutMs: 60_000 });
      setContent(docContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document content');
      setContent(null);
    } finally {
      setLoadingContent(false);
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
  const mindmap = parseMindmapParsingResult(content?.parsing_result);
  const isMindmap = Boolean(mindmap) || document?.file_type?.toUpperCase() === 'XMIND';
  const isMindmapOutline = pageIndex?.strategy === 'xmind-outline';
  const sheetCount = mindmap?.sheets?.length ?? 0;
  const showSheetFilter = isMindmapOutline && sheetCount > 1;

  function handleSelectSheet(sheetIndex: number) {
    setActiveSheetIndex(sheetIndex);
    const sheetNode = pageIndex?.structure?.find((node) => node.sheet_index === sheetIndex);
    if (sheetNode) {
      handleSelectNode(sheetNode);
    }
  }

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

      {loadingDoc ? (
        <p className="document-detail-loading" role="status" aria-live="polite">
          <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
          Loading document…
        </p>
      ) : content ? (
        <div className="document-detail-layout">
          <DocumentMetadataBar
            documentId={documentId!}
            metadata={content.metadata}
            onMetadataChange={(metadata) => {
              setContent((prev) => (prev ? { ...prev, metadata } : prev));
              setDocument((prev) => (prev ? { ...prev, metadata } : prev));
            }}
          />

          {mindmap && (
            <MindmapMetadataPanel
              parsingResult={mindmap}
              onSelectSheet={showSheetFilter ? handleSelectSheet : undefined}
              activeSheetIndex={showSheetFilter ? activeSheetIndex : null}
            />
          )}

          <div
            ref={containerRef}
            className="document-detail-split"
            style={{ ['--document-detail-left-pct' as string]: `${leftPct}%` }}
          >
            <aside className="document-detail-pageindex" aria-label="Page index">
              <h3 className="document-detail-panel-heading">
                {isMindmapOutline ? 'Mind map outline' : 'Page index'}
              </h3>
              <PageIndexTreePanel
                tree={pageIndex}
                activeNodeId={activeNodeId}
                onSelectNode={handleSelectNode}
                sheetFilterIndex={showSheetFilter ? activeSheetIndex : null}
                emptyHint={
                  isMindmap
                    ? 'Run the pipeline to build a topic tree from the XMind file.'
                    : undefined
                }
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
      ) : loadingContent ? (
        <p className="document-detail-loading" role="status" aria-live="polite">
          <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
          Loading parsed content…
        </p>
      ) : document ? (
        <div className="document-detail-panel-empty">
          <p>Could not load parsed content.</p>
          <p className="document-detail-panel-hint">Check object storage connectivity or re-run the pipeline.</p>
        </div>
      ) : null}
    </div>
  );
}
