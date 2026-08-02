import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Loader2, Plus, Settings, Trash2 } from 'lucide-react';
import {
  deleteDocumentChunks,
  fetchImportSources,
  getKbImportJob,
  getKnowledgeBase,
  listIndexedDocuments,
  startKbImport,
  type ImportSources,
  type KbImportJob,
  type KbIndexedDocument,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import { listModelConfigs, type ModelConfig } from '../api/models.ts';
import { KbImportModal } from '../components/KbImportModal.tsx';
import { KbRagSettingsModal } from '../components/KbRagSettingsModal.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
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
  const [loading, setLoading] = useState(!initialKb);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<KbImportJob | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [embeddingModels, setEmbeddingModels] = useState<ModelConfig[]>([]);
  const [importSources, setImportSources] = useState<ImportSources | null>(null);

  const importJobActive =
    activeJob !== null && activeJob.status !== 'completed' && activeJob.status !== 'failed';

  const canImport = Boolean(canWrite && kb?.capabilities.import);

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

  const displayRows = useMemo((): RagDisplayRow[] => {
    const indexedById = new Map(docs.map((doc) => [doc.document_id, doc]));
    const rows: RagDisplayRow[] = docs.map((doc) => ({
      document_id: doc.document_id,
      document_name: doc.document_name,
      channel_path: doc.channel_path,
      chunk_count: doc.chunk_count,
      indexed_at: doc.indexed_at,
      status: 'indexed',
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

  async function handleImport(input: { channelIds: string[]; documentIds: string[] }) {
    if (!knowledgeBaseId) return;
    setError('');
    const result = await startKbImport(knowledgeBaseId, input);
    setActiveJob(result.job);
    setImportOpen(false);
    await load({ silent: true });
  }

  async function handleDeleteChunks(documentId: string) {
    if (!knowledgeBaseId) return;
    setDeletingDocId(documentId);
    setError('');
    try {
      await deleteDocumentChunks(knowledgeBaseId, documentId);
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
        <p className="admin-muted">Loading…</p>
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

          {importJobActive && activeJob && (
            <div className="kb-import-progress" role="status">
              <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
              Indexing: {activeJob.completed_count}/{activeJob.total_count} documents
              {activeJob.failed_count > 0 ? ` (${activeJob.failed_count} failed)` : ''}
            </div>
          )}

          <section className="kb-items-section">
            <div className="kb-items-header">
              <h2 className="kb-section-title">Indexed documents ({total})</h2>
              {canImport && (
                <div className="kb-items-toolbar">
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

            <div className="admin-table-wrap kb-detail-table-wrap">
              <table className="admin-table kb-detail-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Channel</th>
                    <th className="kb-item-status-col">Status</th>
                    <th>Chunks</th>
                    <th>Indexed at</th>
                    {canWrite && <th className="kb-item-actions-col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 6 : 5} className="admin-table-empty">
                        &nbsp;
                      </td>
                    </tr>
                  ) : (
                    displayRows.map((row) => (
                      <tr key={row.document_id}>
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
                        {canWrite && (
                          <td className="kb-item-actions-col">
                            {row.status === 'indexed' ? (
                              <button
                                type="button"
                                className="icon-btn danger"
                                title="Remove indexed chunks"
                                aria-label={`Remove chunks for ${row.document_name}`}
                                disabled={deletingDocId === row.document_id || importJobActive}
                                onClick={() => void handleDeleteChunks(row.document_id)}
                              >
                                {deletingDocId === row.document_id ? (
                                  <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                                ) : (
                                  <Trash2 {...iconProps()} />
                                )}
                              </button>
                            ) : null}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="admin-muted">Knowledge base not found.</p>
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
