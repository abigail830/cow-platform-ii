import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ExternalLink, Plus } from 'lucide-react';
import {
  getKnowledgeBase,
  getKbImportJob,
  listKbItems,
  startKbImport,
  type KbImportJob,
  type KbItem,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import { KbImportModal } from '../components/KbImportModal.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { hasPermission } from '../shared/permissions.ts';

function statusClass(status: string): string {
  if (status === 'completed') return 'kb-status-completed';
  if (status === 'failed') return 'kb-status-failed';
  if (status === 'importing' || status === 'running' || status === 'pending') return 'kb-status-pending';
  return '';
}

export function KnowledgeBaseDetailPage() {
  const { knowledgeBaseId } = useParams<{ knowledgeBaseId: string }>();
  const { user } = useAppOutletContext();
  const canWrite = useMemo(
    () => hasPermission(user, 'knowledge-management:knowledge-bases', 'write'),
    [user],
  );

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [items, setItems] = useState<KbItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<KbImportJob | null>(null);

  const load = useCallback(async () => {
    if (!knowledgeBaseId) return;
    setLoading(true);
    setError('');
    try {
      const [kbRow, itemResult] = await Promise.all([
        getKnowledgeBase(knowledgeBaseId),
        listKbItems(knowledgeBaseId, { limit: 100 }),
      ]);
      setKb(kbRow);
      setItems(itemResult.items);
      setTotal(itemResult.total);
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
    if (!activeJob || !knowledgeBaseId) return;
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return;

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const job = await getKbImportJob(knowledgeBaseId, activeJob.id);
          setActiveJob(job);
          if (job.status === 'completed' || job.status === 'failed') {
            await load();
          }
        } catch {
          // ignore poll errors
        }
      })();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [activeJob, knowledgeBaseId, load]);

  async function handleImport(input: { channelIds: string[]; documentIds: string[] }) {
    if (!knowledgeBaseId) return;
    const result = await startKbImport(knowledgeBaseId, {
      channelIds: input.channelIds,
      documentIds: input.documentIds,
    });
    setActiveJob(result.job);
    setImportOpen(false);
    await load();
  }

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  if (!knowledgeBaseId) {
    return <Navigate to="/knowledge/knowledge-bases" replace />;
  }

  return (
    <main className="admin-page kb-page">
      <Link to="/knowledge/knowledge-bases" className="kb-back-link">← Knowledge bases</Link>

      {loading && !kb ? (
        <p className="admin-muted">Loading…</p>
      ) : kb ? (
        <>
          <header className="admin-header kb-page-header">
            <div>
              <AdminPageTitle main={kb.name} accent="" />
              <AdminPageDescription>
                {kb.description || 'PageIndex knowledge base'}
              </AdminPageDescription>
            </div>
            {canWrite && kb.capabilities.import && (
              <button type="button" className="btn-primary" onClick={() => setImportOpen(true)}>
                <Plus {...iconProps({ size: 16 })} aria-hidden />
                Import knowledge
              </button>
            )}
          </header>

          {error && <p className="admin-error" role="alert">{error}</p>}

          {activeJob && activeJob.status !== 'completed' && activeJob.status !== 'failed' && (
            <div className="kb-import-progress" role="status">
              Importing… {activeJob.completed_count}/{activeJob.total_count} completed
              ({activeJob.failed_count} failed)
            </div>
          )}

          <section className="kb-items-section">
            <h2 className="kb-section-title">Items ({total})</h2>
            {items.length === 0 ? (
              <p className="admin-muted">No items imported yet.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Path</th>
                    <th>Status</th>
                    <th>Imported</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.document_name}</td>
                      <td className="kb-path-cell">{item.channel_path || '—'}</td>
                      <td>
                        <span className={`kb-status-badge ${statusClass(item.import_status)}`}>
                          {item.import_status}
                        </span>
                      </td>
                      <td>{item.imported_at ? new Date(item.imported_at).toLocaleString() : '—'}</td>
                      <td>
                        <Link
                          to={`/knowledge/documents/${item.document_id}`}
                          className="icon-btn"
                          title="Open document"
                          aria-label="Open document"
                        >
                          <ExternalLink {...iconProps({ size: 16 })} aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : (
        <p className="admin-error">Knowledge base not found.</p>
      )}

      {importOpen && (
        <KbImportModal onCancel={() => setImportOpen(false)} onConfirm={handleImport} />
      )}
    </main>
  );
}
