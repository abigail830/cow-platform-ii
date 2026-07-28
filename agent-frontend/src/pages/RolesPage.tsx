import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { listPermissions, type PermissionRecord } from '../api/permissions.ts';
import { getRole, updateRolePermissions } from '../api/roles.ts';
import { listAdminRoles, type AdminRole } from '../api/users.ts';
import { IconEdit } from '../components/AdminActionIcons.tsx';
import { RolePermissionsDrawer } from '../components/RolePermissionsDrawer.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { ADMIN_PAGES } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = ADMIN_PAGES.find((item) => item.path === '/admin/roles')!;

type RoleSummary = AdminRole & {
  grantCount: number;
  readCount: number;
  writeCount: number;
};

function formatPermissionSummary(role: RoleSummary): string {
  if (role.key === 'admin' && role.isSystem) return 'All permissions';
  if (role.grantCount === 0) return 'No permissions';
  return `${role.readCount} read · ${role.writeCount} write`;
}

export function RolesPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'admin:roles', 'write'), [user]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [catalog, setCatalog] = useState<PermissionRecord[]>([]);
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roleRows, permissionRows] = await Promise.all([
        listAdminRoles(),
        listPermissions({ category: 'admin' }),
      ]);
      setCatalog(permissionRows);

      const summaries = await Promise.all(
        roleRows.map(async (role) => {
          const detail = await getRole(role.id);
          const readCount = detail.permissions.filter((grant) => grant.accessLevel === 'read').length;
          const writeCount = detail.permissions.filter((grant) => grant.accessLevel === 'write').length;
          return {
            ...role,
            grantCount: detail.permissions.length,
            readCount,
            writeCount,
          };
        }),
      );
      setRoles(summaries);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) setForbidden(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEditor(role: RoleSummary) {
    setEditingRole(role);
    try {
      const detail = await getRole(role.id);
      setGrantedIds(new Set(detail.permissions.map((grant) => grant.permissionId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load role');
      setEditingRole(null);
    }
  }

  async function handleSave(permissionIds: string[]) {
    if (!editingRole) return;
    setSaving(true);
    setError('');
    try {
      await updateRolePermissions(editingRole.id, permissionIds);
      setEditingRole(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) return <Navigate to="/chat" replace />;

  return (
    <>
      <main className="admin-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>Bundle read and write permissions into roles assigned to users.</AdminPageDescription>
        </header>

        {error && <p className="error inline">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Permissions</th>
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
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-table-empty">
                    No roles found.
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <div className="model-cell-name">{role.label}</div>
                      <div className="model-cell-id">{role.key}</div>
                    </td>
                    <td>{role.description ?? '—'}</td>
                    <td>
                      <span className="capability-pill">{formatPermissionSummary(role)}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title={canWrite && !(role.key === 'admin' && role.isSystem) ? 'Edit permissions' : 'View permissions'}
                          onClick={() => void openEditor(role)}
                        >
                          <IconEdit />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {editingRole && (
        <RolePermissionsDrawer
          role={editingRole}
          catalog={catalog}
          grantedIds={grantedIds}
          canWrite={canWrite}
          saving={saving}
          onClose={() => setEditingRole(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
