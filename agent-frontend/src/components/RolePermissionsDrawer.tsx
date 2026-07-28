import { useEffect, useMemo, useState } from 'react';
import type { PermissionRecord } from '../api/permissions.ts';
import type { AdminRole } from '../api/users.ts';

type ResourceGroup = {
  resource: string;
  label: string;
  read?: PermissionRecord;
  write?: PermissionRecord;
};

function groupPermissions(permissions: PermissionRecord[]): ResourceGroup[] {
  const groups = new Map<string, ResourceGroup>();

  for (const perm of permissions) {
    const parts = perm.key.split(':');
    if (parts.length !== 3) continue;
    const [, resource, access] = parts;
    if (!resource || (access !== 'read' && access !== 'write')) continue;

    const baseLabel = perm.label.replace(/ — (Read|Write)$/, '');
    const group = groups.get(resource) ?? { resource, label: baseLabel };
    if (access === 'read') group.read = perm;
    else group.write = perm;
    groups.set(resource, group);
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

type RolePermissionsDrawerProps = {
  role: AdminRole;
  catalog: PermissionRecord[];
  grantedIds: Set<string>;
  canWrite: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (permissionIds: string[]) => Promise<void>;
};

export function RolePermissionsDrawer({
  role,
  catalog,
  grantedIds: initialGrantedIds,
  canWrite,
  saving,
  onClose,
  onSave,
}: RolePermissionsDrawerProps) {
  const [grantedIds, setGrantedIds] = useState(initialGrantedIds);
  const isSystemAdmin = role.key === 'admin' && role.isSystem;
  const resourceGroups = useMemo(() => groupPermissions(catalog), [catalog]);

  useEffect(() => {
    setGrantedIds(initialGrantedIds);
  }, [initialGrantedIds, role.id]);

  function togglePermission(permissionId: string) {
    if (!canWrite || isSystemAdmin) return;
    setGrantedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  }

  return (
    <div className="admin-drawer-backdrop" onClick={onClose}>
      <aside className="admin-drawer" onClick={(event) => event.stopPropagation()}>
        <header className="admin-drawer-header">
          <div>
            <h2>{role.label}</h2>
            <p className="admin-drawer-subtitle">{role.description ?? role.key}</p>
            {isSystemAdmin && (
              <p className="roles-system-note">System role — all platform and admin permissions.</p>
            )}
          </div>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="admin-drawer-body">
          <div className="admin-table-wrap">
            <table className="admin-table role-perm-matrix">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Read</th>
                  <th>Write</th>
                </tr>
              </thead>
              <tbody>
                {resourceGroups.map((group) => (
                  <tr key={group.resource}>
                    <td>{group.label}</td>
                    <td>
                      {group.read && (
                        <label className="role-perm-check">
                          <input
                            type="checkbox"
                            className="brand-checkbox"
                            checked={grantedIds.has(group.read.id) || isSystemAdmin}
                            disabled={!canWrite || isSystemAdmin}
                            onChange={() => togglePermission(group.read!.id)}
                          />
                        </label>
                      )}
                    </td>
                    <td>
                      {group.write && (
                        <label className="role-perm-check">
                          <input
                            type="checkbox"
                            className="brand-checkbox"
                            checked={grantedIds.has(group.write.id) || isSystemAdmin}
                            disabled={!canWrite || isSystemAdmin}
                            onChange={() => togglePermission(group.write!.id)}
                          />
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="admin-drawer-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            {canWrite && !isSystemAdmin ? 'Cancel' : 'Close'}
          </button>
          {canWrite && !isSystemAdmin && (
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void onSave([...grantedIds])}
            >
              {saving ? 'Saving…' : 'Save permissions'}
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
