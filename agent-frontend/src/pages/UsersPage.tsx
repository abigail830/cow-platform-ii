import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { createAdminUser, deleteAdminUser, listAdminRoles, listAdminUsers, updateAdminUserRoles, type AdminRole, type AdminUser } from '../api/users.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { IconDelete, IconEdit } from '../components/AdminActionIcons.tsx';
import { UserForm } from '../components/UserForm.tsx';
import { UserRolesForm } from '../components/UserRolesForm.tsx';
import { ADMIN_PAGES } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = ADMIN_PAGES.find((item) => item.path === '/admin/users')!;

export function UsersPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'admin:users', 'write'), [user]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listAdminUsers>>>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [userRows, roleRows] = await Promise.all([listAdminUsers(search), listAdminRoles()]);
      setUsers(userRows);
      setRoles(roleRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) setForbidden(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) return <Navigate to="/chat" replace />;

  return (
    <>
      <main className="admin-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>Create local accounts and assign one or more roles.</AdminPageDescription>
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by email or name…"
              />
            </div>
          </div>
          {canWrite && (
            <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
              + Add user
            </button>
          )}
        </div>

        {error && <p className="error inline">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.displayName ?? '—'}</td>
                    <td>{user.email}</td>
                    <td>
                      <div className="capability-list">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <span key={role.id} className="capability-pill">
                              {role.label}
                            </span>
                          ))
                        ) : (
                          <span className="capability-pill muted">No roles</span>
                        )}
                      </div>
                    </td>
                    <td className="mono-cell">{new Date(user.createdAt).toLocaleString()}</td>
                    <td>
                      {canWrite && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit roles"
                            onClick={() => setEditingUser(user)}
                          >
                            <IconEdit />
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Delete"
                            onClick={() => {
                              if (!window.confirm(`Delete user "${user.email}"?`)) return;
                              void deleteAdminUser(user.id).then(() => load());
                            }}
                          >
                            <IconDelete />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {formOpen && (
        <UserForm
          roles={roles}
          onCancel={() => setFormOpen(false)}
          onSubmit={async (input) => {
            await createAdminUser(input);
            setFormOpen(false);
            await load();
          }}
        />
      )}
      {editingUser && (
        <UserRolesForm
          user={editingUser}
          roles={roles}
          onCancel={() => setEditingUser(null)}
          onSubmit={async (roleIds) => {
            await updateAdminUserRoles(editingUser.id, roleIds);
            setEditingUser(null);
            await load();
          }}
        />
      )}
    </>
  );
}
