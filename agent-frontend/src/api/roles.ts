import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';
import type { AdminRole } from './users.ts';

export type RolePermissionGrant = {
  permissionId: string;
  key: string;
  label: string;
  category: string;
  accessLevel: 'read' | 'write';
};

export type RoleDetail = {
  role: AdminRole;
  permissions: RolePermissionGrant[];
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function getRole(roleId: string): Promise<RoleDetail> {
  const data = await authFetch(`/api/admin/roles/${roleId}`);
  return {
    role: data.role as AdminRole,
    permissions: (data.permissions ?? []) as RolePermissionGrant[],
  };
}

export async function updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
  await authFetch(`/api/admin/roles/${roleId}/permissions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissionIds }),
  });
}
