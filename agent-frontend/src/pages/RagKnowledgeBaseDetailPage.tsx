import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Loader2, Plus, Settings, Trash2 } from 'lucide-react';
import {
  deleteDocumentChunks,
  getKbImportJob,
  getKnowledgeBase,
  listIndexedDocuments,
  startKbImport,
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

  const importJobActive =
    activeJob !== null && activeJob.status !== 'completed' && activeJob.status !== 'failed';

  const canImport = Boolean(canWrite && kb?.capabilities.import);

  const load = useCallback(async () => {
    if (!knowledgeBaseId) return;
    setLoading(true);
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
      setLoading(false);
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

  useEffect(() => {
    if (!activeJob || !knowledgeBaseId) return;
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return;

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const job = await getKbImportJob(knowledgeBaseId, activeJob.id);
          setActiveJob(job);
          await load();
        } catch {
          /* ignore poll errors */
        }
      })();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [activeJob, knowledgeBaseId, load]);

  async function handleImport(input: { channelIds: string[]; documentIds: string[] }) {
    if (!knowledgeBaseId) return;
    const result = await startKbImport(knowledgeBaseId, input);
    setActiveJob(result.job);
    setImportOpen(false);
    await load();
  }

  async function handleDeleteChunks(documentId: string) {
    if (!knowledgeBaseId) return;
    setDeletingDocId(documentId);
    setError('');
    try {
      await deleteDocumentChunks(knowledgeBaseId, documentId);
      await load();
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
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Channel</th>
                    <th>Chunks</th>
                    <th>Indexed at</th>
                    {canWrite && <th className="kb-item-actions-col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canWrite ? 5 : 4}
                        className="admin-table-empty"
                      >
                        &nbsp;
                      </td>
                    </tr>
                  ) : (
                    docs.map((doc) => (
                      <tr key={doc.document_id}>
                        <td>{doc.document_name}</td>
                        <td className="kb-path-cell">{doc.channel_path}</td>
                        <td>{doc.chunk_count}</td>
                        <td>{new Date(doc.indexed_at).toLocaleString()}</td>
                        {canWrite && (
                          <td className="kb-item-actions-col">
                            <button
                              type="button"
                              className="icon-btn danger"
                              title="Remove indexed chunks"
                              aria-label={`Remove chunks for ${doc.document_name}`}
                              disabled={deletingDocId === doc.document_id || importJobActive}
                              onClick={() => void handleDeleteChunks(doc.document_id)}
                            >
                              {deletingDocId === doc.document_id ? (
                                <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                              ) : (
                                <Trash2 {...iconProps()} />
                              )}
                            </button>
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
