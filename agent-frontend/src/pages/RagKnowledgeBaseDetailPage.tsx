import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight, Loader2, Plus, Settings, Trash2 } from 'lucide-react';
import {
  deleteDocumentChunks,
  fetchImportSources,
  getKbImportJob,
  getKnowledgeBase,
  listAllIndexedDocumentIds,
  listDocumentChunks,
  listIndexedDocuments,
  startKbImport,
  type ImportSources,
  type KbDocumentChunks,
  type KbImportJob,
  type KbIndexedDocument,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import { listModelConfigs, type ModelConfig } from '../api/models.ts';
import { IconRun } from '../components/AdminActionIcons.tsx';
import { KbImportModal } from '../components/KbImportModal.tsx';
import { KbRagDocumentDetailPanel } from '../components/KbRagDocumentDetailPanel.tsx';
import { KbRagSettingsModal } from '../components/KbRagSettingsModal.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { hasPermission } from '../shared/permissions.ts';

type RagKnowledgeBaseDetailPageProps = {
  initialKb?: KnowledgeBase;
};

type RagDisplayRow = {
  document_id: string;
  document_name: string;
  channel_path: string;
  chunk_count: number | null;
  indexed_at: string | null;
  status: 'indexed' | 'indexing' | 'failed';
};

function resolveDocMeta(
  documentId: string,
  sources: ImportSources | null,
): { name: string; channelPath: string } {
  if (!sources) return { name: documentId, channelPath: '' };
  for (const channel of sources.channels) {
    const doc = (sources.documents_by_channel[channel.id] ?? []).find((d) => d.id === documentId);
    if (doc) {
      return { name: doc.name, channelPath: channel.name };
    }
  }
  return { name: documentId, channelPath: '' };
}

function ragStatusClass(status: RagDisplayRow['status']): string {
  if (status === 'indexed') return 'kb-status-completed';
  if (status === 'failed') return 'kb-status-failed';
  return 'kb-status-pending';
}

const RERUN_DOCUMENT_TITLE =
  'Delete existing chunks and embeddings for this document, then rebuild from source markdown.';

const REINDEX_ALL_TITLE =
  'Reindex every indexed document: delete all existing chunks and embeddings, then rebuild from source markdown.';

function isImportJobInProgress(job: KbImportJob | null): boolean {
  return job !== null && job.status !== 'completed' && job.status !== 'failed';
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
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [rerunningDocId, setRerunningDocId] = useState<string | null>(null);
  const [reindexingAll, setReindexingAll] = useState(false);
  const [embeddingModels, setEmbeddingModels] = useState<ModelConfig[]>([]);
  const [importSources, setImportSources] = useState<ImportSources | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detailChunks, setDetailChunks] = useState<KbDocumentChunks | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedDocumentIdRef = useRef<string | null>(null);

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('kb-rag-detail-split', 52, {
    minPct: 28,
    maxPct: 72,
  });

  const importJobActive =
    activeJob !== null && activeJob.status !== 'completed' && activeJob.status !== 'failed';

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
    void fetchImportSources()
      .then(setImportSources)
      .catch(() => setImportSources(null));
  }, [load]);

  useEffect(() => {
    if (!canWrite) return;
    void listModelConfigs({ apiType: 'embeddings', limit: 100 })
      .then((res) => setEmbeddingModels(res.models))
      .catch(() => setEmbeddingModels([]));
  }, [canWrite]);

  useEffect(() => {
    if (!activeJob || !knowledgeBaseId) return;

    if (activeJob.status === 'completed') {
      void load({ silent: true });
      return;
    }

    if (activeJob.status === 'failed') {
      setError(activeJob.error_message || 'Indexing failed');
      void load({ silent: true });
      return;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const job = await getKbImportJob(knowledgeBaseId, activeJob.id);
          setActiveJob(job);
          await load({ silent: true });
        } catch {
          /* ignore poll errors */
        }
      })();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [activeJob, knowledgeBaseId, load]);

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
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document chunks');
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

  const displayRows = useMemo((): RagDisplayRow[] => {
    const jobInProgress = isImportJobInProgress(activeJob);
    const jobDocumentIds = new Set(activeJob?.document_ids ?? []);
    const indexedById = new Map(docs.map((doc) => [doc.document_id, doc]));
    const rows: RagDisplayRow[] = docs.map((doc) => ({
      document_id: doc.document_id,
      document_name: doc.document_name,
      channel_path: doc.channel_path,
      chunk_count: doc.chunk_count,
      indexed_at: doc.indexed_at,
      status:
        jobInProgress && jobDocumentIds.has(doc.document_id) ? 'indexing' : 'indexed',
    }));

    for (const documentId of activeJob?.document_ids ?? []) {
      if (indexedById.has(documentId)) continue;
      const meta = resolveDocMeta(documentId, importSources);
      rows.push({
        document_id: documentId,
        document_name: meta.name,
        channel_path: meta.channelPath,
        chunk_count: null,
        indexed_at: null,
        status:
          activeJob?.status === 'failed'
            ? 'failed'
            : activeJob?.status === 'running' || activeJob?.status === 'pending'
              ? 'indexing'
              : 'failed',
      });
    }

    return rows;
  }, [docs, activeJob, importSources]);

  function stopRowAction(event: { stopPropagation: () => void }) {
    event.stopPropagation();
  }

  async function handleImport(input: { channelIds: string[]; documentIds: string[] }) {
    if (!knowledgeBaseId) return;
    setError('');
    const result = await startKbImport(knowledgeBaseId, input);
    setActiveJob(result.job);
    setImportOpen(false);
    await load({ silent: true });
  }

  async function rerunDocumentIds(documentIds: string[]) {
    if (!knowledgeBaseId || documentIds.length === 0) return;
    setError('');
    const result = await startKbImport(knowledgeBaseId, { documentIds });
    setActiveJob(result.job);
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
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove indexed chunks');
    } finally {
      setDeletingDocId(null);
    }
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
        <ListLoadingState label="Loading knowledge base…" />
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
                      ) : displayRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="admin-table-empty">
                            &nbsp;
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((row) => {
                          const selected = selectedDocumentId === row.document_id;
                          const canOpenDetail = row.status === 'indexed';

                          return (
                            <tr
                              key={row.document_id}
                              className={
                                canOpenDetail
                                  ? selected
                                    ? 'kb-item-row selected'
                                    : 'kb-item-row'
                                  : undefined
                              }
                              onClick={
                                canOpenDetail
                                  ? () => setSelectedDocumentId(row.document_id)
                                  : undefined
                              }
                            >
                              <td>{row.document_name}</td>
                              <td className="kb-path-cell">{row.channel_path}</td>
                              <td className="kb-item-status-col">
                                {row.status === 'indexing' ? (
                                  <span className="kb-item-status-loading">
                                    <Loader2 {...iconProps({ size: 14, className: 'icon-btn-spin' })} aria-hidden />
                                    indexing
                                  </span>
                                ) : (
                                  <span className={`kb-status-badge ${ragStatusClass(row.status)}`}>
                                    {row.status}
                                  </span>
                                )}
                              </td>
                              <td>{row.chunk_count ?? '—'}</td>
                              <td>{row.indexed_at ? new Date(row.indexed_at).toLocaleString() : '—'}</td>
                              <td className="kb-item-actions-col" onClick={stopRowAction}>
                                <div className="row-actions">
                                  {canWrite && (row.status === 'indexed' || row.status === 'indexing') ? (
                                    <>
                                      {row.status === 'indexed' ? (
                                        <button
                                          type="button"
                                          className="icon-btn icon-btn--run"
                                          title={RERUN_DOCUMENT_TITLE}
                                          aria-label={`Rerun indexing for ${row.document_name}`}
                                          disabled={
                                            importJobActive ||
                                            reindexingAll ||
                                            rerunningDocId === row.document_id
                                          }
                                          onClick={() => void handleRerunDocument(row.document_id)}
                                        >
                                          {rerunningDocId === row.document_id ? (
                                            <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                                          ) : (
                                            <IconRun {...iconProps()} />
                                          )}
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="icon-btn danger"
                                        title="Remove indexed chunks from this knowledge base"
                                        aria-label={`Remove chunks for ${row.document_name}`}
                                        disabled={
                                          deletingDocId === row.document_id ||
                                          importJobActive ||
                                          row.status === 'indexing'
                                        }
                                        onClick={() => void handleDeleteChunks(row.document_id)}
                                      >
                                        {deletingDocId === row.document_id ? (
                                          <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                                        ) : (
                                          <Trash2 {...iconProps()} />
                                        )}
                                      </button>
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
                                    aria-label={`View chunks for ${row.document_name}`}
                                    onClick={() => setSelectedDocumentId(row.document_id)}
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
    </main>
  );
}
