import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  createKnowledgeBase,
  listKnowledgeBases,
  type KnowledgeBase,
  type KnowledgeBaseType,
} from '../api/knowledgeBases.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/knowledge/knowledge-bases')!;

function typeLabel(type: KnowledgeBaseType): string {
  return type === 'page_index' ? 'PageIndex' : 'RAG';
}

export function KnowledgeBasesListPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(
    () => hasPermission(user, 'knowledge-management:knowledge-bases', 'write'),
    [user],
  );

  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<KnowledgeBaseType>('page_index');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listKnowledgeBases();
      setItems(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load knowledge bases';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      await createKnowledgeBase({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
      });
      setModalOpen(false);
      setName('');
      setDescription('');
      setType('page_index');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create knowledge base');
    } finally {
      setCreating(false);
    }
  }

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  return (
    <main className="admin-page kb-page">
      <header className="admin-header kb-page-header">
        <div>
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Create PageIndex knowledge bases and import parsed documents from channels.
          </AdminPageDescription>
        </div>
        {canWrite && (
          <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
            <Plus {...iconProps({ size: 16 })} aria-hidden />
            New knowledge base
          </button>
        )}
      </header>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="admin-muted">No knowledge bases yet.</p>
      ) : (
        <div className="kb-card-grid">
          {items.map((kb) => (
            <Link key={kb.id} to={`/knowledge/knowledge-bases/${kb.id}`} className="kb-card">
              <div className="kb-card-header">
                <h2 className="kb-card-title">{kb.name}</h2>
                <span className="kb-type-badge">{typeLabel(kb.type)}</span>
              </div>
              {kb.description && <p className="kb-card-description">{kb.description}</p>}
              <p className="kb-card-meta">{kb.item_count ?? 0} items</p>
            </Link>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-labelledby="kb-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="kb-create-title" className="modal-title">New knowledge base</h2>
            <label className="modal-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={256} />
            </label>
            <label className="modal-field">
              <span>Description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </label>
            <label className="modal-field">
              <span>Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as KnowledgeBaseType)}>
                <option value="page_index">PageIndex</option>
                <option value="rag">RAG (coming soon)</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={creating || !name.trim()}
                onClick={() => void handleCreate()}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
