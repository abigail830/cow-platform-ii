import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download, Loader2, Maximize2, Minimize2, Pencil, Save, X } from 'lucide-react';
import { flattenChannels } from '../api/documentChannels.ts';
import {
  fetchDocumentContent,
  getDocument,
  saveDocumentArtifact,
  type DocumentContentResponse,
  type DocumentRecord,
} from '../api/documents.ts';
import { AsyncModuleBoundary } from '../components/AsyncModuleBoundary.tsx';
import { DocumentMetadataBar } from '../components/DocumentMetadataBar.tsx';
import { MindmapMetadataPanel, parseMindmapParsingResult } from '../components/MindmapMetadataPanel.tsx';
import { formatDocumentStatusLabel } from '../components/DocumentPipelineStatus.tsx';
import { JsonCodeEditor } from '../components/JsonCodeEditor.tsx';
import { MarkdownCodeEditor } from '../components/MarkdownCodeEditor.tsx';
import { PageIndexTreePanel, type PageIndexNode, type PageIndexTree } from '../components/PageIndexTree.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { DocumentParsedMarkdown } from '../components/DocumentParsedMarkdown.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { channelCanManage, channelHasWriteAccess } from '../shared/channel-access.ts';
import { formatPageIndexDraft, parsePageIndexDraft } from '../shared/document-artifacts.ts';
import {
  findPageIndexNode,
  parseDocumentDeepLink,
  rightPanelTabFromView,
  scrollToDocumentTarget,
} from '../shared/document-deep-link.ts';
import { downloadTextFile, withDownloadExtension } from '../shared/download-text.ts';
import { lazyWithRetry } from '../shared/lazy-with-retry.ts';
import { supportsUdocViewer } from '../shared/source-ref.ts';
import { useDocumentsOutletContext } from './DocumentsOutletContext.tsx';

const DocumentUdocViewer = lazyWithRetry(
  () =>
    import('../components/DocumentUdocViewer.tsx').then((mod) => ({
      default: mod.DocumentUdocViewer,
    })),
  'DocumentUdocViewer',
);

type RightPanelTab = 'pageindex' | 'parsed';

type DocumentDetailPageProps = {
  /** When opened via /captures/:captureId router for document-file captures. */
  documentIdOverride?: string;
};

export function DocumentDetailPage({ documentIdOverride }: DocumentDetailPageProps = {}) {
  const { documentId: routeDocumentId } = useParams<{ documentId: string }>();
  const documentId = documentIdOverride ?? routeDocumentId;
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLink = useMemo(() => parseDocumentDeepLink(searchParams.toString()), [searchParams]);
  const { channels, canWrite, setSelectedChannelId } = useDocumentsOutletContext();
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
  const [rightPanelMaximized, setRightPanelMaximized] = useState(false);
  const [editingArtifact, setEditingArtifact] = useState(false);
  const [artifactDraft, setArtifactDraft] = useState('');
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [artifactError, setArtifactError] = useState('');
  const editingArtifactRef = useRef(false);

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('document-detail-split', 50);
  const prevDocumentStatusRef = useRef<string | null>(null);

  const loadContent = useCallback(async () => {
    if (!documentId) return;
    setLoadingContent(true);
    try {
      const docContent = await fetchDocumentContent(documentId, { timeoutMs: 60_000 });
      setContent(docContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document content');
      setContent(null);
    } finally {
      setLoadingContent(false);
    }
  }, [documentId]);

  const loadDetail = useCallback(async () => {
    if (!documentId) return;
    setLoadingDoc(true);
    setLoadingContent(true);
    setError('');
    setContent(null);
    setRightPanelMaximized(false);
    setEditingArtifact(false);
    setArtifactDraft('');
    setArtifactError('');
    setSavingArtifact(false);

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

    await loadContent();
  }, [documentId, loadContent, setSelectedChannelId]);

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
    if (!document) return;
    const prev = prevDocumentStatusRef.current;
    prevDocumentStatusRef.current = document.status;
    if (
      prev === 'running' &&
      (document.status === 'completed' || document.status === 'failed') &&
      !editingArtifactRef.current
    ) {
      void loadContent();
    }
  }, [document, loadContent]);

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
  const documentChannel = useMemo(() => {
    if (!document) return null;
    return flattenChannels(channels).find((channel) => channel.id === document.channel_id) ?? null;
  }, [channels, document]);
  const canEditArtifacts = Boolean(canWrite && channelHasWriteAccess(documentChannel));
  const canDownloadArtifacts = channelCanManage(documentChannel);
  const hasPageIndex = pageIndex != null;
  const hasParsedMarkdown = Boolean(content?.markdown?.trim());
  const activeArtifactHasContent = rightPanelTab === 'pageindex' ? hasPageIndex : hasParsedMarkdown;
  const detailMetadata = useMemo(() => {
    const docMeta = document?.metadata ?? {};
    const contentMeta = content?.metadata ?? {};
    return { ...contentMeta, ...docMeta };
  }, [content?.metadata, document?.metadata]);
  const rightPanelHeading =
    rightPanelTab === 'pageindex'
      ? isMindmapOutline
        ? 'Mind map outline'
        : 'Page index'
      : 'Parsed content';

  editingArtifactRef.current = editingArtifact;

  useEffect(() => {
    if (!rightPanelMaximized) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !editingArtifactRef.current) {
        setRightPanelMaximized(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rightPanelMaximized]);

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

  function cancelArtifactEdit() {
    setEditingArtifact(false);
    setArtifactDraft('');
    setArtifactError('');
    setSavingArtifact(false);
  }

  function switchRightPanelTab(next: RightPanelTab) {
    if (next !== rightPanelTab) cancelArtifactEdit();
    setRightPanelTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
  }

  function startArtifactEdit() {
    if (!canEditArtifacts) return;
    setArtifactError('');
    setArtifactDraft(
      rightPanelTab === 'pageindex'
        ? formatPageIndexDraft(pageIndex)
        : (content?.markdown ?? ''),
    );
    setEditingArtifact(true);
  }

  function downloadActiveArtifact() {
    if (!canDownloadArtifacts || !document || !activeArtifactHasContent) return;
    if (rightPanelTab === 'pageindex' && pageIndex) {
      downloadTextFile(
        formatPageIndexDraft(pageIndex),
        withDownloadExtension(`${document.name}-page-index`, 'json'),
        'application/json;charset=utf-8',
      );
      return;
    }
    if (content?.markdown) {
      downloadTextFile(
        content.markdown,
        withDownloadExtension(`${document.name}-parsed`, 'md'),
        'text/markdown;charset=utf-8',
      );
    }
  }

  async function saveActiveArtifact() {
    if (!documentId || !canEditArtifacts || savingArtifact) return;
    setSavingArtifact(true);
    setArtifactError('');
    try {
      if (rightPanelTab === 'pageindex') {
        const parsed = parsePageIndexDraft(artifactDraft);
        await saveDocumentArtifact(documentId, 'page_index', JSON.stringify(parsed, null, 2));
        setContent((prev) =>
          prev
            ? { ...prev, page_index: parsed, has_page_index: true }
            : prev,
        );
      } else {
        await saveDocumentArtifact(documentId, 'markdown', artifactDraft);
        setContent((prev) =>
          prev
            ? { ...prev, markdown: artifactDraft, has_markdown: Boolean(artifactDraft.trim()) }
            : prev,
        );
      }
      setEditingArtifact(false);
      setArtifactDraft('');
    } catch (err) {
      setArtifactError(err instanceof Error ? err.message : 'Failed to save artifact');
    } finally {
      setSavingArtifact(false);
    }
  }

  return (
    <div className="document-detail-page">
      <div className="document-detail-toolbar">
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
                <AsyncModuleBoundary message="Failed to load the document viewer.">
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
                </AsyncModuleBoundary>
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

            {rightPanelMaximized ? (
              <div
                className="document-detail-maximize-backdrop"
                onClick={() => {
                  if (!editingArtifact) setRightPanelMaximized(false);
                }}
              />
            ) : null}
            <section
              className={`document-detail-content${rightPanelMaximized ? ' is-maximized' : ''}`}
              aria-label="Parsed document views"
              aria-modal={rightPanelMaximized || undefined}
              role={rightPanelMaximized ? 'dialog' : undefined}
            >
              <div className="document-detail-content-header">
                <h3 className="document-detail-panel-heading">{rightPanelHeading}</h3>
                <div className="document-detail-content-header-tools">
                  <div className="document-detail-view-tabs" role="tablist" aria-label="Parsed document views">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPanelTab === 'pageindex'}
                      className={`document-detail-view-tab${rightPanelTab === 'pageindex' ? ' active' : ''}`}
                      onClick={() => switchRightPanelTab('pageindex')}
                      disabled={savingArtifact}
                    >
                      Page index
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPanelTab === 'parsed'}
                      className={`document-detail-view-tab${rightPanelTab === 'parsed' ? ' active' : ''}`}
                      onClick={() => switchRightPanelTab('parsed')}
                      disabled={savingArtifact}
                    >
                      Parsed
                    </button>
                  </div>
                  {!loadingContent ? (
                    <div className="document-detail-toolbar-actions">
                      {canEditArtifacts && editingArtifact ? (
                        <>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Save"
                            aria-label={rightPanelTab === 'pageindex' ? 'Save page index' : 'Save parsed markdown'}
                            onClick={() => void saveActiveArtifact()}
                            disabled={savingArtifact}
                          >
                            {savingArtifact ? (
                              <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                            ) : (
                              <Save {...iconProps()} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Cancel editing"
                            aria-label="Cancel editing"
                            onClick={cancelArtifactEdit}
                            disabled={savingArtifact}
                          >
                            <X {...iconProps()} />
                          </button>
                        </>
                      ) : canEditArtifacts ? (
                        <button
                          type="button"
                          className="icon-btn"
                          title={rightPanelTab === 'pageindex' ? 'Edit page index' : 'Edit parsed markdown'}
                          aria-label={rightPanelTab === 'pageindex' ? 'Edit page index' : 'Edit parsed markdown'}
                          onClick={startArtifactEdit}
                        >
                          <Pencil {...iconProps()} />
                        </button>
                      ) : null}
                      {canDownloadArtifacts && activeArtifactHasContent ? (
                        <button
                          type="button"
                          className="icon-btn"
                          title={
                            rightPanelTab === 'pageindex'
                              ? 'Download page index JSON'
                              : 'Download parsed markdown'
                          }
                          aria-label={
                            rightPanelTab === 'pageindex'
                              ? 'Download page index JSON'
                              : 'Download parsed markdown'
                          }
                          onClick={downloadActiveArtifact}
                          disabled={editingArtifact}
                        >
                          <Download {...iconProps()} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn"
                        title={rightPanelMaximized ? 'Exit full view' : 'Maximize'}
                        aria-label={rightPanelMaximized ? 'Exit full view' : 'Maximize parsed panel'}
                        onClick={() => setRightPanelMaximized((current) => !current)}
                      >
                        {rightPanelMaximized ? (
                          <Minimize2 {...iconProps()} />
                        ) : (
                          <Maximize2 {...iconProps()} />
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {artifactError ? (
                <p className="document-detail-artifact-error" role="alert">
                  {artifactError}
                </p>
              ) : null}

              {loadingContent ? (
                <p className="document-detail-loading document-detail-panel-loading" role="status" aria-live="polite">
                  <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
                  Loading parsed content…
                </p>
              ) : editingArtifact && rightPanelTab === 'pageindex' ? (
                <div className="document-detail-artifact-editor">
                  <JsonCodeEditor
                    value={artifactDraft}
                    onChange={setArtifactDraft}
                    disabled={savingArtifact}
                    placeholder='{ "structure": [] }'
                  />
                </div>
              ) : editingArtifact ? (
                <div className="document-detail-artifact-editor">
                  <MarkdownCodeEditor
                    value={artifactDraft}
                    onChange={setArtifactDraft}
                    disabled={savingArtifact}
                    placeholder="Write parsed markdown…"
                  />
                </div>
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
                    <DocumentParsedMarkdown
                      documentId={documentId!}
                      content={content.markdown}
                      headingIds
                    />
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
