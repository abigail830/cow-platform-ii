import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createPermission,
  deletePermission,
  listPermissions,
  updatePermission,
  type PermissionRecord,
} from '../api/permissions.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { IconDelete, IconEdit, IconView } from '../components/AdminActionIcons.tsx';
import { PermissionForm } from '../components/PermissionForm.tsx';
import { ADMIN_PAGES } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = ADMIN_PAGES.find((item) => item.path === '/admin/permissions')!;

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'admin', label: 'Admin' },
  { id: 'agent', label: 'Agent' },
] as const;

export function PermissionsPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'admin:permissions', 'write'), [user]);
  const [items, setItems] = useState<PermissionRecord[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PermissionRecord | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listPermissions({ category, search });
      setItems(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) setForbidden(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) return <Navigate to="/chat" replace />;

  return (
    <>
      <main className="admin-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Define what each admin feature exposes in the UI and which APIs it maps to.
          </AdminPageDescription>
        </header>

        <div className="admin-toolbar">
          <div className="admin-toolbar-left">
            <div className="admin-search">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.25" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search permissions…" />
            </div>
            <div className="admin-filters">
              {CATEGORY_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`admin-filter${category === filter.id ? ' active' : ''}`}
                  onClick={() => setCategory(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          {canWrite && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setReadOnly(false);
                setFormOpen(true);
              }}
            >
              + Add permission
            </button>
          )}
        </div>

        {error && <p className="error inline">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Category</th>
                <th>Patterns</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="admin-table-empty">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-table-empty">
                    No permissions found.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="model-cell-name">{item.label}</div>
                      <div className="model-cell-id">{item.key}</div>
                    </td>
                    <td>
                      <span className="capability-pill">{item.category}</span>
                    </td>
                    <td className="mono-cell">
                      {item.routePatterns.length} routes · {item.apiPatterns.length} APIs
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="View"
                          onClick={() => {
                            setEditing(item);
                            setReadOnly(true);
                            setFormOpen(true);
                          }}
                        >
                          <IconView />
                        </button>
                        {canWrite && !item.isSystem && (
                          <>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Edit"
                              onClick={() => {
                                setEditing(item);
                                setReadOnly(false);
                                setFormOpen(true);
                              }}
                            >
                              <IconEdit />
                            </button>
                            <button
                              type="button"
                              className="icon-btn danger"
                              title="Delete"
                              onClick={() => {
                                if (!window.confirm(`Delete permission "${item.label}"?`)) return;
                                void deletePermission(item.id).then(() => load());
                              }}
                            >
                              <IconDelete />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {formOpen && (
        <PermissionForm
          initial={editing}
          readOnly={readOnly}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={async (input) => {
            if (editing) await updatePermission(editing.id, input);
            else await createPermission(input);
            setFormOpen(false);
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}
