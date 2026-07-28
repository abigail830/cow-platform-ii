import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createModelConfig,
  deleteModelConfig,
  listModelConfigs,
  MODEL_API_TYPE_LABELS,
  setDefaultModelConfig,
  updateModelConfig,
  type ModelApiType,
  type ModelConfig,
} from '../api/models.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { ModelConfigForm } from '../components/ModelConfigForm.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/admin/models')!;

const API_TYPE_FILTERS: Array<{ id: 'all' | ModelApiType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'chat-completions', label: 'Chat completions' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'custom-endpoint', label: 'Custom endpoint' },
  { id: 'image-generation', label: 'Image generation' },
  { id: 'video-generation', label: 'Video generation' },
];

export function ModelsConfigPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'platform-basic:models', 'write'), [user]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState('');
  const [apiTypeFilter, setApiTypeFilter] = useState<'all' | ModelApiType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listModelConfigs({
        apiType: apiTypeFilter,
        search,
        page,
        limit,
      });
      setModels(data.models);
      setTotal(data.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [apiTypeFilter, limit, page, search]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  async function handleDelete(model: ModelConfig) {
    if (!window.confirm(`Delete model "${model.name}"?`)) return;
    try {
      await deleteModelConfig(model.id);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  async function handleSetDefault(model: ModelConfig) {
    try {
      await setDefaultModelConfig(model.id);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default');
    }
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  if (forbidden) {
    return <Navigate to="/chat" replace />;
  }

  return (
    <>
      <main className="admin-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Manage model connections from different providers for use across the platform.
          </AdminPageDescription>
        </header>

        <div className="admin-toolbar">
          <div className="admin-toolbar-left">
            <div className="admin-search">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.25" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
                placeholder="Search models…"
              />
            </div>
            <div className="admin-filters">
              {API_TYPE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`admin-filter${apiTypeFilter === filter.id ? ' active' : ''}`}
                  onClick={() => {
                    setPage(1);
                    setApiTypeFilter(filter.id);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            disabled={!canWrite}
            title={canWrite ? undefined : 'Read-only access'}
          >
            + Add model
          </button>
        </div>

        {error && <p className="error inline">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th>API format</th>
                <th>Capabilities</th>
                <th>Default</th>
                <th>Base URL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    Loading…
                  </td>
                </tr>
              ) : models.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    No models configured yet. Click &quot;Add model&quot; to get started.
                  </td>
                </tr>
              ) : (
                models.map((model) => (
                  <tr key={model.id}>
                    <td>
                      <div className="model-cell">
                        <span className="model-cell-icon" aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                            <path d="M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                          </svg>
                        </span>
                        <div>
                          <div className="model-cell-name">{model.name}</div>
                          <div className="model-cell-id">{model.modelId}</div>
                        </div>
                      </div>
                    </td>
                    <td>{model.provider}</td>
                    <td>{MODEL_API_TYPE_LABELS[model.apiType]}</td>
                    <td>
                      <div className="capability-list">
                        {model.capabilities.length > 0 ? (
                          model.capabilities.map((cap) => (
                            <span key={cap} className="capability-pill">
                              {cap}
                            </span>
                          ))
                        ) : (
                          <span className="capability-pill muted">—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {model.isDefault ? (
                        <span className="default-badge">Default</span>
                      ) : (
                        <button type="button" className="btn-link" onClick={() => void handleSetDefault(model)}>
                          Set as default
                        </button>
                      )}
                    </td>
                    <td className="mono-cell">{model.baseUrl ?? '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Edit"
                          onClick={() => {
                            setEditing(model);
                            setFormOpen(true);
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                              d="M11.5 2.5l2 2L5.5 12.5H3.5v-2L11.5 2.5z"
                              stroke="currentColor"
                              strokeWidth="1.25"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Delete"
                          onClick={() => void handleDelete(model)}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3.5 5.5h9M6 5.5V4h4v1.5M6 8v3.5M10 8v3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                            <path d="M4.5 5.5l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="admin-footer">
          <span>
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <span>{limit} per page</span>
        </footer>
      </main>

      {formOpen && (
        <ModelConfigForm
          initial={editing}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={async (input) => {
            if (editing) {
              await updateModelConfig(editing.id, input);
            } else {
              await createModelConfig(input);
            }
            setFormOpen(false);
            setEditing(null);
            await loadModels();
          }}
        />
      )}
    </>
  );
}
