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
import { IconDelete, IconRun } from '../components/AdminActionIcons.tsx';
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

type DeleteConfirmState =
  | { mode: 'single'; documentId: string; documentName: string }
  | { mode: 'bulk'; documentIds: string[] }
  | null;

function isReindexableStatus(status: KbIndexedDocument['status']): boolean {
  return status === 'indexed' || status === 'failed';
}

function isRemovableStatus(status: KbIndexedDocument['status']): boolean {
  return status === 'indexed' || status === 'indexing' || status === 'failed';
}

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
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(() => new Set());
  const [rerunningDocId, setRerunningDocId] = useState<string | null>(null);
  const [batchReindexing, setBatchReindexing] = useState(false);
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
  const selectionCount = selectedDocumentIds.size;
  const allPageSelected = docs.length > 0 && docs.every((doc) => selectedDocumentIds.has(doc.document_id));
  const selectedReindexableCount = useMemo(
    () => docs.filter((doc) => selectedDocumentIds.has(doc.document_id) && isReindexableStatus(doc.status)).length,
    [docs, selectedDocumentIds],
  );
  const selectedRemovableCount = useMemo(
    () => docs.filter((doc) => selectedDocumentIds.has(doc.document_id) && isRemovableStatus(doc.status)).length,
    [docs, selectedDocumentIds],
  );

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
      setSelectedDocumentIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (docResult.items.some((doc) => doc.document_id === id)) next.add(id);
        }
        return next;
      });
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

  function toggleDocumentSelection(documentId: string, checked: boolean) {
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(documentId);
      else next.delete(documentId);
      return next;
    });
  }

  function toggleSelectAllPage(checked: boolean) {
    if (!checked) {
      setSelectedDocumentIds(new Set());
      return;
    }
    setSelectedDocumentIds(new Set(docs.map((doc) => doc.document_id)));
  }

  function reindexableIdsFromSelection(): string[] {
    return docs
      .filter((doc) => selectedDocumentIds.has(doc.document_id) && isReindexableStatus(doc.status))
      .map((doc) => doc.document_id);
  }

  function removableIdsFromSelection(): string[] {
    return docs
      .filter((doc) => selectedDocumentIds.has(doc.document_id) && isRemovableStatus(doc.status))
      .map((doc) => doc.document_id);
  }

  async function handleReindexSelected() {
    const documentIds = reindexableIdsFromSelection();
    if (documentIds.length === 0) return;
    setBatchReindexing(true);
    try {
      await rerunDocumentIds(documentIds);
      setSelectedDocumentIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reindex selected documents');
    } finally {
      setBatchReindexing(false);
    }
  }

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
      setSelectedDocumentIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove indexed chunks');
      throw err;
    } finally {
      setDeletingDocId(null);
    }
  }

  async function handleDeleteSelected() {
    if (!knowledgeBaseId) return;
    const documentIds = removableIdsFromSelection();
    if (documentIds.length === 0) return;

    setBulkDeleting(true);
    setError('');
    try {
      for (const documentId of documentIds) {
        await deleteDocumentChunks(knowledgeBaseId, documentId);
      }
      if (selectedDocumentId && documentIds.includes(selectedDocumentId)) {
        setSelectedDocumentId(null);
        setDetailChunks(null);
      }
      setSelectedDocumentIds(new Set());
      setDeleteConfirm(null);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove selected documents');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    if (deleteConfirm.mode === 'single') {
      try {
        await handleDeleteChunks(deleteConfirm.documentId);
        setDeleteConfirm(null);
      } catch {
        // error already set
      }
      return;
    }
    await handleDeleteSelected();
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

          {error && <p className="admin-error" role="alert">{error}</p>}

          <section className="kb-items-section">
            <div className="kb-items-header">
              <h2 className="kb-section-title">Indexed documents ({total})</h2>
              {canImport && (
                <div className="kb-items-toolbar">
                  {docs.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          selectedReindexableCount === 0 ||
                          !kb.is_configured ||
                          importJobActive ||
                          batchReindexing ||
                          reindexingAll
                        }
                        title={
                          !kb.is_configured
                            ? 'Configure embedding model in Settings first'
                            : selectionCount > 0 && selectedReindexableCount === 0
                              ? 'Only indexed or failed documents can be reindexed'
                              : RERUN_DOCUMENT_TITLE
                        }
                        onClick={() => void handleReindexSelected()}
                      >
                        {batchReindexing ? (
                          <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
                        ) : (
                          <IconRun {...iconProps({ size: 16 })} aria-hidden />
                        )}
                        Reindex selected
                        {selectedReindexableCount > 0 ? ` (${selectedReindexableCount})` : ''}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          selectedRemovableCount === 0 ||
                          importJobActive ||
                          bulkDeleting ||
                          deletingDocId != null
                        }
                        onClick={() =>
                          setDeleteConfirm({
                            mode: 'bulk',
                            documentIds: removableIdsFromSelection(),
                          })
                        }
                      >
                        <IconDelete {...iconProps({ size: 16 })} aria-hidden />
                        Remove selected
                        {selectedRemovableCount > 0 ? ` (${selectedRemovableCount})` : ''}
                      </button>
                    </>
                  )}
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
                    className="btn-dark"
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
                        {canImport && (
                          <th className="kb-item-select-col">
                            <input
                              type="checkbox"
                              className="brand-checkbox"
                              checked={allPageSelected}
                              aria-label="Select all documents on this page"
                              onChange={(event) => toggleSelectAllPage(event.target.checked)}
                            />
                          </th>
                        )}
                        <th>Document</th>
                        <th className="kb-detail-meta-col">Channel</th>
                        <th className="kb-item-status-col">Status</th>
                        <th className="kb-detail-meta-col">Chunks</th>
                        <th className="kb-detail-meta-col">Indexed at</th>
                        <th className="kb-item-actions-col">Actions</th>
                        <th className="kb-item-detail-hint-col" aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={canImport ? 8 : 7} className="admin-table-empty session-explorer-table-loading">
                            <ListLoadingState label="Loading indexed documents…" />
                          </td>
                        </tr>
                      ) : docs.length === 0 ? (
                        <tr>
                          <td colSpan={canImport ? 8 : 7} className="admin-table-empty">
                            &nbsp;
                          </td>
                        </tr>
                      ) : (
                        docs.map((doc) => {
                          const selected = selectedDocumentId === doc.document_id;
                          const rowChecked = selectedDocumentIds.has(doc.document_id);
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
                              {canImport && (
                                <td className="kb-item-select-col" onClick={stopRowAction}>
                                  <input
                                    type="checkbox"
                                    className="brand-checkbox"
                                    checked={rowChecked}
                                    aria-label={`Select ${doc.document_name}`}
                                    onChange={(event) =>
                                      toggleDocumentSelection(doc.document_id, event.target.checked)
                                    }
                                  />
                                </td>
                              )}
                              <td>{doc.document_name}</td>
                              <td className="kb-path-cell kb-detail-meta-col">{doc.channel_path}</td>
                              <td className="kb-item-status-col">
                                <RagDocumentStatusCell doc={doc} jobActive={importJobActive} />
                              </td>
                              <td className="kb-detail-meta-col">{doc.chunk_count ?? '—'}</td>
                              <td className="kb-detail-meta-col">
                                {doc.indexed_at ? new Date(doc.indexed_at).toLocaleString() : '—'}
                              </td>
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
                                            batchReindexing ||
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
                                      {doc.status === 'indexed' ||
                                      doc.status === 'indexing' ||
                                      doc.status === 'failed' ? (
                                        <button
                                          type="button"
                                          className="icon-btn danger"
                                          title="Remove indexed chunks from this knowledge base"
                                          aria-label={`Remove chunks for ${doc.document_name}`}
                                          disabled={
                                            deletingDocId === doc.document_id ||
                                            bulkDeleting ||
                                            importJobActive ||
                                            doc.status === 'indexing'
                                          }
                                          onClick={() =>
                                            setDeleteConfirm({
                                              mode: 'single',
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
          mode={deleteConfirm.mode}
          documentName={
            deleteConfirm.mode === 'single' ? deleteConfirm.documentName : undefined
          }
          count={deleteConfirm.mode === 'bulk' ? deleteConfirm.documentIds.length : undefined}
          deleting={
            deleteConfirm.mode === 'single'
              ? deletingDocId === deleteConfirm.documentId
              : bulkDeleting
          }
          onCancel={() => {
            if (deleteConfirm.mode === 'single') {
              if (deletingDocId !== deleteConfirm.documentId) setDeleteConfirm(null);
              return;
            }
            if (!bulkDeleting) setDeleteConfirm(null);
          }}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </main>
  );
}
