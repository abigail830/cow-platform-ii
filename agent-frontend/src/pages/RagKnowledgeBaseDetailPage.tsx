import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight, Loader2, Plus, Settings, Trash2 } from 'lucide-react';
import {
  deleteDocumentChunks,
  getKnowledgeBase,
  listAllIndexedDocumentIds,
  listDocumentChunks,
  listIndexedDocuments,
  startKbImport,
  type KbDocumentChunks,
  type KbImportJob,
  type KbIndexedDocument,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import { listModelConfigs, type ModelConfig } from '../api/models.ts';
import { IconRun } from '../components/AdminActionIcons.tsx';
import { KbImportModal } from '../components/KbImportModal.tsx';
import { KbPageLoadingState } from '../components/KbPageLoadingState.tsx';
import { KbItemDeleteConfirmModal } from '../components/KbItemDeleteConfirmModal.tsx';
import { KbRagDocumentDetailPanel } from '../components/KbRagDocumentDetailPanel.tsx';
import { KbRagSettingsModal } from '../components/KbRagSettingsModal.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { isKbImportJobActive, useKbImportJobPolling } from '../hooks/useKbImportJobPolling.ts';
import { hasPermission } from '../shared/permissions.ts';

type RagKnowledgeBaseDetailPageProps = {
  initialKb?: KnowledgeBase;
};

function ragStatusClass(status: KbIndexedDocument['status']): string {
  if (status === 'indexed') return 'kb-status-completed';
  if (status === 'failed') return 'kb-status-failed';
  return 'kb-status-pending';
}

function RagDocumentStatusCell({
  doc,
  jobActive,
}: {
  doc: KbIndexedDocument;
  jobActive: boolean;
}) {
  if (doc.status === 'indexing' || (jobActive && doc.status === 'pending')) {
    return (
      <span className="kb-item-status-loading">
        <Loader2 {...iconProps({ size: 14, className: 'icon-btn-spin' })} aria-hidden />
        indexing
      </span>
    );
  }

  return (
    <div className="kb-item-status-cell">
      <span className={`kb-status-badge ${ragStatusClass(doc.status)}`}>{doc.status}</span>
      {doc.status === 'failed' && doc.index_error && (
        <span className="kb-item-status-error" title={doc.index_error}>
          {doc.index_error}
        </span>
      )}
    </div>
  );
}

const RERUN_DOCUMENT_TITLE =
  'Delete existing chunks and embeddings for this document, then rebuild from source markdown.';

const REINDEX_ALL_TITLE =
  'Reindex every indexed document: delete all existing chunks and embeddings, then rebuild from source markdown.';

function ListLoadingState({ label }: { label: string }) {
  return (
    <p className="session-explorer-loading" role="status" aria-live="polite">
      <Loader2 {...iconProps({ size: 18, className: 'session-explorer-loading-icon' })} aria-hidden />
      {label}
    </p>
  );
}

export function RagKnowledgeBaseDetailPage({ initialKb }: RagKnowledgeBaseDetailPageProps) {
  const { knowledgeBaseId } = useParams<{ knowledgeBaseId: string }>();
  const { user } = useAppOutletContext();
  const canWrite = useMemo(
    () => hasPermission(user, 'knowledge-management:knowledge-bases', 'write'),
    [user],
  );

  const [kb, setKb] = useState<KnowledgeBase | null>(initialKb ?? null);
  const [docs, setDocs] = useState<KbIndexedDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<KbImportJob | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    documentId: string;
    documentName: string;
  } | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [rerunningDocId, setRerunningDocId] = useState<string | null>(null);
  const [reindexingAll, setReindexingAll] = useState(false);
  const [embeddingModels, setEmbeddingModels] = useState<ModelConfig[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detailChunks, setDetailChunks] = useState<KbDocumentChunks | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedDocumentIdRef = useRef<string | null>(null);

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('kb-rag-detail-split', 52, {
    minPct: 28,
    maxPct: 72,
  });

  const importJobActive = isKbImportJobActive(activeJob);

  const listIndexInProgress = useMemo(
    () => docs.some((doc) => doc.status === 'indexing' || doc.status === 'pending'),
    [docs],
  );

  const canImport = Boolean(canWrite && kb?.capabilities.import);

  useEffect(() => {
    selectedDocumentIdRef.current = selectedDocumentId;
  }, [selectedDocumentId]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!knowledgeBaseId) return;
    if (!options?.silent) setLoading(true);
    setError('');
    try {
      const [kbRow, docResult] = await Promise.all([
        getKnowledgeBase(knowledgeBaseId),
        listIndexedDocuments(knowledgeBaseId, { limit: 100 }),
      ]);
      setKb(kbRow);
      setDocs(docResult.items);
      setTotal(docResult.total);
      const currentSelected = selectedDocumentIdRef.current;
      if (currentSelected && !docResult.items.some((doc) => doc.document_id === currentSelected)) {
        setSelectedDocumentId(null);
        setDetailChunks(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load knowledge base';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canWrite) return;
    void listModelConfigs({ apiType: 'embeddings', limit: 100 })
      .then((res) => setEmbeddingModels(res.models))
      .catch(() => setEmbeddingModels([]));
  }, [canWrite]);

  useKbImportJobPolling({
    knowledgeBaseId,
    activeJob,
    setActiveJob,
    listInProgress: listIndexInProgress,
    onRefresh: () => load({ silent: true }),
  });

  useEffect(() => {
    if (!selectedDocumentId || !knowledgeBaseId) {
      setDetailChunks(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    void listDocumentChunks(knowledgeBaseId, selectedDocumentId, { limit: 500 })
      .then((detail) => {
        if (!cancelled) setDetailChunks(detail);
      })
      .catch(() => {
        if (!cancelled) {
          setDetailChunks(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDocumentId, knowledgeBaseId]);

  function stopRowAction(event: { stopPropagation: () => void }) {
    event.stopPropagation();
  }

  async function trackActiveJob(job: KbImportJob) {
    setActiveJob(job);
  }

  async function handleImport(input: { channelIds: string[]; documentIds: string[] }) {
    if (!knowledgeBaseId) return;
    setError('');
    const result = await startKbImport(knowledgeBaseId, input);
    await trackActiveJob(result.job);
    setImportOpen(false);
    await load({ silent: true });
  }

  async function rerunDocumentIds(documentIds: string[]) {
    if (!knowledgeBaseId || documentIds.length === 0) return;
    setError('');
    const result = await startKbImport(knowledgeBaseId, { documentIds });
    await trackActiveJob(result.job);
    await load({ silent: true });
  }

  async function handleRerunDocument(documentId: string) {
    setRerunningDocId(documentId);
    try {
      await rerunDocumentIds([documentId]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rerun indexing');
    } finally {
      setRerunningDocId(null);
    }
  }

  async function handleReindexAll() {
    if (!knowledgeBaseId || total === 0) return;
    setReindexingAll(true);
    setError('');
    try {
      const documentIds = await listAllIndexedDocumentIds(knowledgeBaseId);
      if (documentIds.length === 0) {
        setError('No indexed documents to reindex');
        return;
      }
      await rerunDocumentIds(documentIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start full reindex');
    } finally {
      setReindexingAll(false);
    }
  }

  async function handleDeleteChunks(documentId: string) {
    if (!knowledgeBaseId) return;
    setDeletingDocId(documentId);
    setError('');
    try {
      await deleteDocumentChunks(knowledgeBaseId, documentId);
      if (selectedDocumentId === documentId) {
        setSelectedDocumentId(null);
        setDetailChunks(null);
      }
      setDeleteConfirm(null);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove indexed chunks');
    } finally {
      setDeletingDocId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    await handleDeleteChunks(deleteConfirm.documentId);
  }

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  if (!knowledgeBaseId) {
    return <Navigate to="/knowledge/knowledge-bases" replace />;
  }

  return (
    <main className="admin-page kb-page kb-detail-page">
      <Link to="/knowledge/knowledge-bases" className="kb-back-link">← Knowledge bases</Link>

      {loading && !kb ? (
        <KbPageLoadingState label="Loading knowledge base…" />
      ) : kb ? (
        <>
          <header className="admin-header kb-page-header">
            <div>
              <AdminPageTitle main={kb.name} accent="" />
              <AdminPageDescription>
                {kb.description || 'RAG knowledge base'}
              </AdminPageDescription>
            </div>
          </header>

          <section className="kb-items-section">
            <div className="kb-items-header">
              <h2 className="kb-section-title">Indexed documents ({total})</h2>
              {canImport && (
                <div className="kb-items-toolbar">
                  {total > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={!kb.is_configured || importJobActive || reindexingAll}
                      title={
                        !kb.is_configured
                          ? 'Configure embedding model in Settings first'
                          : REINDEX_ALL_TITLE
                      }
                      onClick={() => void handleReindexAll()}
                    >
                      {reindexingAll ? (
                        <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
                      ) : (
                        <IconRun {...iconProps({ size: 16 })} aria-hidden />
                      )}
                      Reindex all ({total})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings {...iconProps({ size: 16 })} aria-hidden />
                    Settings
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!kb.is_configured || importJobActive}
                    title={!kb.is_configured ? 'Configure embedding model in Settings first' : undefined}
                    onClick={() => setImportOpen(true)}
                  >
                    <Plus {...iconProps({ size: 16 })} aria-hidden />
                    Import &amp; index
                  </button>
                </div>
              )}
            </div>

            <div
              ref={containerRef}
              className={`kb-detail-layout${selectedDocumentId ? ' has-detail' : ''}`}
              style={
                selectedDocumentId
                  ? { ['--kb-detail-left-pct' as string]: `${leftPct}%` }
                  : undefined
              }
            >
              <div className="kb-detail-list-panel">
                <div className="admin-table-wrap kb-detail-table-wrap">
                  <table className="admin-table kb-detail-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Channel</th>
                        <th className="kb-item-status-col">Status</th>
                        <th>Chunks</th>
                        <th>Indexed at</th>
                        <th className="kb-item-actions-col">Actions</th>
                        <th className="kb-item-detail-hint-col" aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="admin-table-empty session-explorer-table-loading">
                            <ListLoadingState label="Loading indexed documents…" />
                          </td>
                        </tr>
                      ) : docs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="admin-table-empty">
                            &nbsp;
                          </td>
                        </tr>
                      ) : (
                        docs.map((doc) => {
                          const selected = selectedDocumentId === doc.document_id;
                          const canOpenDetail = doc.status === 'indexed';

                          return (
                            <tr
                              key={doc.document_id}
                              className={
                                canOpenDetail
                                  ? selected
                                    ? 'kb-item-row selected'
                                    : 'kb-item-row'
                                  : undefined
                              }
                              onClick={
                                canOpenDetail
                                  ? () => setSelectedDocumentId(doc.document_id)
                                  : undefined
                              }
                            >
                              <td>{doc.document_name}</td>
                              <td className="kb-path-cell">{doc.channel_path}</td>
                              <td className="kb-item-status-col">
                                <RagDocumentStatusCell doc={doc} jobActive={importJobActive} />
                              </td>
                              <td>{doc.chunk_count ?? '—'}</td>
                              <td>{doc.indexed_at ? new Date(doc.indexed_at).toLocaleString() : '—'}</td>
                              <td className="kb-item-actions-col" onClick={stopRowAction}>
                                <div className="row-actions">
                                  {canWrite &&
                                  (doc.status === 'indexed' ||
                                    doc.status === 'indexing' ||
                                    doc.status === 'failed') ? (
                                    <>
                                      {doc.status === 'indexed' || doc.status === 'failed' ? (
                                        <button
                                          type="button"
                                          className="icon-btn icon-btn--run"
                                          title={RERUN_DOCUMENT_TITLE}
                                          aria-label={`Rerun indexing for ${doc.document_name}`}
                                          disabled={
                                            importJobActive ||
                                            reindexingAll ||
                                            rerunningDocId === doc.document_id
                                          }
                                          onClick={() => void handleRerunDocument(doc.document_id)}
                                        >
                                          {rerunningDocId === doc.document_id ? (
                                            <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                                          ) : (
                                            <IconRun {...iconProps()} />
                                          )}
                                        </button>
                                      ) : null}
                                      {doc.status === 'indexed' || doc.status === 'indexing' ? (
                                        <button
                                          type="button"
                                          className="icon-btn danger"
                                          title="Remove indexed chunks from this knowledge base"
                                          aria-label={`Remove chunks for ${doc.document_name}`}
                                          disabled={
                                            deletingDocId === doc.document_id ||
                                            importJobActive ||
                                            doc.status === 'indexing'
                                          }
                                          onClick={() =>
                                            setDeleteConfirm({
                                              documentId: doc.document_id,
                                              documentName: doc.document_name,
                                            })
                                          }
                                        >
                                          {deletingDocId === doc.document_id ? (
                                            <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                                          ) : (
                                            <Trash2 {...iconProps()} />
                                          )}
                                        </button>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                              </td>
                              <td className="kb-item-detail-hint-col" onClick={stopRowAction}>
                                {canOpenDetail ? (
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    title="View chunks"
                                    aria-label={`View chunks for ${doc.document_name}`}
                                    onClick={() => setSelectedDocumentId(doc.document_id)}
                                  >
                                    <ChevronRight {...iconProps()} />
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedDocumentId && (
                <>
                  <div
                    className="kb-detail-split-handle"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize document list"
                    onMouseDown={onHandleMouseDown}
                  />
                  <KbRagDocumentDetailPanel
                    detail={detailChunks}
                    loading={detailLoading}
                    onClose={() => {
                      setSelectedDocumentId(null);
                      setDetailChunks(null);
                    }}
                  />
                </>
              )}
            </div>
          </section>
        </>
      ) : (
        <p className="admin-error" role="alert">{error || 'Knowledge base not found.'}</p>
      )}

      {importOpen && (
        <KbImportModal
          onCancel={() => setImportOpen(false)}
          onConfirm={handleImport}
        />
      )}

      {settingsOpen && kb && (
        <KbRagSettingsModal
          kb={kb}
          embeddingModels={embeddingModels}
          onCancel={() => setSettingsOpen(false)}
          onSaved={(updated) => {
            setKb(updated);
            setSettingsOpen(false);
          }}
        />
      )}

      {deleteConfirm && (
        <KbItemDeleteConfirmModal
          variant="rag-chunks"
          mode="single"
          documentName={deleteConfirm.documentName}
          deleting={deletingDocId === deleteConfirm.documentId}
          onCancel={() => {
            if (deletingDocId !== deleteConfirm.documentId) setDeleteConfirm(null);
          }}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </main>
  );
}
