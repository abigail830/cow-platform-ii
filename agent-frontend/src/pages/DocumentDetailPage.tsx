import { lazy, Suspense } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
import { PageIndexTreePanel, type PageIndexNode, type PageIndexTree } from '../components/PageIndexTree.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { Markdown } from '../chat/Markdown.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import {
  findPageIndexNode,
  parseDocumentDeepLink,
  rightPanelTabFromView,
  scrollToDocumentTarget,
} from '../shared/document-deep-link.ts';
import { supportsUdocViewer } from '../shared/source-ref.ts';
import { useDocumentsOutletContext } from './DocumentsOutletContext.tsx';

const DocumentUdocViewer = lazy(() =>
  import('../components/DocumentUdocViewer.tsx').then((mod) => ({ default: mod.DocumentUdocViewer })),
);

type RightPanelTab = 'pageindex' | 'parsed';

export function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLink = useMemo(() => parseDocumentDeepLink(searchParams.toString()), [searchParams]);
  const { setSelectedChannelId } = useDocumentsOutletContext();
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [content, setContent] = useState<DocumentContentResponse | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [loadingContent, setLoadingContent] = useState(true);
  const [error, setError] = useState('');
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>(() =>
    rightPanelTabFromView(deepLink.view),
  );

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('document-detail-split', 50);

  const loadDetail = useCallback(async () => {
    if (!documentId) return;
    setLoadingDoc(true);
    setLoadingContent(true);
    setError('');
    setContent(null);

    let doc: DocumentRecord;
    try {
      doc = await getDocument(documentId);
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

  useEffect(() => {
    setRightPanelTab(rightPanelTabFromView(deepLink.view));
  }, [deepLink.view]);

  const pageIndex = (content?.page_index as PageIndexTree | null) ?? null;
  const mindmap = parseMindmapParsingResult(content?.parsing_result);
  const isMindmap = Boolean(mindmap) || document?.file_type?.toUpperCase() === 'XMIND';
  const isMindmapOutline = pageIndex?.strategy === 'xmind-outline';
  const sheetCount = mindmap?.sheets?.length ?? 0;
  const showSheetFilter = isMindmapOutline && sheetCount > 1;
  const showOriginalPreview = supportsUdocViewer(document?.file_type);
  const detailMetadata = content?.metadata ?? document?.metadata ?? {};
  const rightPanelHeading =
    rightPanelTab === 'pageindex'
      ? isMindmapOutline
        ? 'Mind map outline'
        : 'Page index'
      : 'Parsed content';

  const scrollToNode = useCallback((node: PageIndexNode, highlight = false) => {
    setActiveNodeId(node.node_id);
    setRightPanelTab('parsed');
    scrollToDocumentTarget(contentRef.current, {
      nodeId: node.node_id,
      line: node.line_num ?? null,
      heading: node.title,
      highlight,
    });
  }, []);

  useEffect(() => {
    if (loadingContent || rightPanelTab !== 'parsed' || !pageIndex) return;

    const node = findPageIndexNode(pageIndex, deepLink);
    if (node) {
      if (typeof node.sheet_index === 'number') setActiveSheetIndex(node.sheet_index);
      window.requestAnimationFrame(() => scrollToNode(node, deepLink.highlight));
      return;
    }

    if (deepLink.line != null || deepLink.nodeId || deepLink.heading) {
      window.requestAnimationFrame(() =>
        scrollToDocumentTarget(contentRef.current, {
          nodeId: deepLink.nodeId,
          line: deepLink.line,
          heading: deepLink.heading,
          highlight: deepLink.highlight,
        }),
      );
    }
  }, [loadingContent, rightPanelTab, pageIndex, deepLink, scrollToNode]);

  function handleSelectNode(node: PageIndexNode) {
    const params = new URLSearchParams(searchParams);
    params.set('view', 'parsed');
    setSearchParams(params, { replace: true });
    scrollToNode(node, false);
  }

  function handleSelectSheet(sheetIndex: number) {
    setActiveSheetIndex(sheetIndex);
    const sheetNode = pageIndex?.structure?.find((node) => node.sheet_index === sheetIndex);
    if (sheetNode) handleSelectNode(sheetNode);
  }

  function switchRightPanelTab(next: RightPanelTab) {
    setRightPanelTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
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
      ) : document ? (
        <div className="document-detail-layout">
          <DocumentMetadataBar
            documentId={documentId!}
            metadata={detailMetadata}
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
            <aside className="document-detail-original" aria-label="Original document">
              <h3 className="document-detail-panel-heading">Original</h3>
              {showOriginalPreview && documentId ? (
                <Suspense
                  fallback={
                    <div className="document-viewer-loading" role="status">
                      <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
                      <span>Preparing viewer…</span>
                    </div>
                  }
                >
                  <DocumentUdocViewer
                    documentId={documentId}
                    page={deepLink.page}
                    searchQuery={deepLink.highlight ? deepLink.heading : null}
                  />
                </Suspense>
              ) : (
                <div className="document-detail-panel-empty">
                  <p>Original preview is not available for this file type.</p>
                </div>
              )}
            </aside>

            <div
              className="document-detail-split-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              onMouseDown={onHandleMouseDown}
            />

            <section className="document-detail-content" aria-label="Parsed document views">
              <div className="document-detail-content-header">
                <h3 className="document-detail-panel-heading">{rightPanelHeading}</h3>
                <div className="document-detail-view-tabs" role="tablist" aria-label="Parsed document views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightPanelTab === 'pageindex'}
                    className={`document-detail-view-tab${rightPanelTab === 'pageindex' ? ' active' : ''}`}
                    onClick={() => switchRightPanelTab('pageindex')}
                  >
                    Page index
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightPanelTab === 'parsed'}
                    className={`document-detail-view-tab${rightPanelTab === 'parsed' ? ' active' : ''}`}
                    onClick={() => switchRightPanelTab('parsed')}
                  >
                    Parsed
                  </button>
                </div>
              </div>

              {loadingContent ? (
                <p className="document-detail-loading document-detail-panel-loading" role="status" aria-live="polite">
                  <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
                  Loading parsed content…
                </p>
              ) : rightPanelTab === 'pageindex' ? (
                <div className="document-detail-pageindex-body">
                  <PageIndexTreePanel
                    tree={pageIndex}
                    activeNodeId={activeNodeId}
                    onSelectNode={handleSelectNode}
                    sheetFilterIndex={showSheetFilter ? activeSheetIndex : null}
                    emptyHint={
                      isMindmap
                        ? 'Run the pipeline to build a topic tree from the XMind file.'
                        : 'Run the pipeline to build a page index from the parsed document.'
                    }
                  />
                </div>
              ) : (
                <div ref={contentRef} className="document-detail-content-scroll">
                  {content?.has_markdown && content.markdown ? (
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
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
