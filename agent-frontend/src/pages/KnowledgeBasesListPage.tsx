import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBaseType,
} from '../api/knowledgeBases.ts';
import { KbDeleteConfirmModal } from '../components/KbDeleteConfirmModal.tsx';
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
  const [editingKb, setEditingKb] = useState<KnowledgeBase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<KnowledgeBaseType>('page_index');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((kb) => {
      const kbName = kb.name.toLowerCase();
      const desc = (kb.description ?? '').toLowerCase();
      return kbName.includes(query) || desc.includes(query);
    });
  }, [items, search]);

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

  function openCreateModal() {
    setEditingKb(null);
    setName('');
    setDescription('');
    setType('page_index');
    setModalOpen(true);
  }

  function openEditModal(kb: KnowledgeBase) {
    setEditingKb(kb);
    setName(kb.name);
    setDescription(kb.description ?? '');
    setType(kb.type);
    setModalOpen(true);
  }

  function closeFormModal() {
    setModalOpen(false);
    setEditingKb(null);
    setName('');
    setDescription('');
    setType('page_index');
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editingKb) {
        await updateKnowledgeBase(editingKb.id, {
          name: name.trim(),
          description: description.trim() || null,
        });
      } else {
        await createKnowledgeBase({
          name: name.trim(),
          description: description.trim() || undefined,
          type,
        });
      }
      closeFormModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save knowledge base');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await deleteKnowledgeBase(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete knowledge base');
    } finally {
      setDeleting(false);
    }
  }

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  return (
    <main className="admin-page kb-page">
      <header className="admin-header">
        <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
        <AdminPageDescription>
          Create PageIndex knowledge bases and import parsed documents from channels.
        </AdminPageDescription>
      </header>

      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search kb-page-search">
            <Search {...iconProps()} aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or description…"
              aria-label="Search knowledge bases"
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSearch('')}
            disabled={!search}
          >
            Reset
          </button>
        </div>
        {canWrite && (
          <button type="button" className="btn-primary" onClick={openCreateModal}>
            <Plus {...iconProps({ size: 16 })} aria-hidden />
            New knowledge base
          </button>
        )}
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="admin-muted">No knowledge bases yet.</p>
      ) : filteredItems.length === 0 ? (
        <p className="admin-muted">No knowledge bases match your search.</p>
      ) : (
        <div className="kb-card-grid">
          {filteredItems.map((kb) => (
            <article key={kb.id} className="kb-card">
              <Link to={`/knowledge/knowledge-bases/${kb.id}`} className="kb-card-main">
                <h2 className="kb-card-title">{kb.name}</h2>
                <div className="kb-card-type-row">
                  <span className="kb-type-badge">{typeLabel(kb.type)}</span>
                </div>
                {kb.description && <p className="kb-card-description">{kb.description}</p>}
              </Link>
              <div className="kb-card-footer">
                <p className="kb-card-meta">{kb.item_count ?? 0} items</p>
                {canWrite && (
                  <div className="kb-card-actions row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Edit"
                      aria-label={`Edit ${kb.name}`}
                      onClick={() => openEditModal(kb)}
                    >
                      <Pencil {...iconProps()} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Delete"
                      aria-label={`Delete ${kb.name}`}
                      onClick={() => setDeleteTarget(kb)}
                    >
                      <Trash2 {...iconProps()} />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={closeFormModal}>
          <div
            className="modal-card model-config-form"
            role="dialog"
            aria-labelledby="kb-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="kb-form-title">
              {editingKb ? 'Edit knowledge base' : 'New knowledge base'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              <div className="form-grid">
                <label className="form-field form-field-wide">
                  <span>Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={256} required />
                </label>
                <label className="form-field form-field-wide">
                  <span>Description</span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </label>
                <div className="form-field form-field-wide">
                  <span>Type</span>
                  <div className="kb-type-options" role="radiogroup" aria-label="Knowledge base type">
                    <label className="kb-type-option">
                      <input
                        type="radio"
                        name="kb-type"
                        value="page_index"
                        checked={type === 'page_index'}
                        disabled={editingKb !== null}
                        onChange={() => setType('page_index')}
                      />
                      <span>PageIndex</span>
                    </label>
                    <label className="kb-type-option">
                      <input
                        type="radio"
                        name="kb-type"
                        value="rag"
                        checked={type === 'rag'}
                        disabled={editingKb !== null}
                        onChange={() => setType('rag')}
                      />
                      <span>RAG (coming soon)</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeFormModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
                  {saving ? 'Saving…' : editingKb ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <KbDeleteConfirmModal
          knowledgeBaseName={deleteTarget.name}
          itemCount={deleteTarget.item_count ?? 0}
          deleting={deleting}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </main>
  );
}
