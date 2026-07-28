import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  legacyRole: string;
  roles: Array<{ id: string; key: string; label: string }>;
  createdAt: string;
};

export type AdminRole = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  isSystem: boolean;
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

export async function listAdminUsers(search?: string): Promise<AdminUser[]> {
  const suffix = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  const data = await authFetch(`/api/admin/users${suffix}`);
  return (data.users ?? []) as AdminUser[];
}

export async function createAdminUser(input: {
  email: string;
  displayName?: string;
  password: string;
  roleIds: string[];
}): Promise<void> {
  await authFetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateAdminUserRoles(userId: string, roleIds: string[]): Promise<void> {
  await authFetch(`/api/admin/users/${userId}/roles`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleIds }),
  });
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await authFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

export async function listAdminRoles(): Promise<AdminRole[]> {
  const data = await authFetch('/api/admin/roles');
  return (data.roles ?? []) as AdminRole[];
}
