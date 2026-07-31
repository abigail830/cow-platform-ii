import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type PermissionRecord = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string;
  routePatterns: string[];
  apiPatterns: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PermissionInput = {
  key: string;
  label: string;
  description?: string | null;
  category: string;
  routePatterns: string[];
  apiPatterns: string[];
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function listPermissions(params?: { category?: string; search?: string }) {
  const query = new URLSearchParams();
  if (params?.category && params.category !== 'all') query.set('category', params.category);
  if (params?.search?.trim()) query.set('search', params.search.trim());
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authFetch(`/api/admin/permissions${suffix}`);
  return (data.permissions ?? []) as PermissionRecord[];
}

export async function createPermission(input: PermissionInput): Promise<PermissionRecord> {
  const data = await authFetch('/api/admin/permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.permission as PermissionRecord;
}

export async function updatePermission(
  id: string,
  input: Partial<PermissionInput>,
): Promise<PermissionRecord> {
  const data = await authFetch(`/api/admin/permissions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.permission as PermissionRecord;
}

export async function deletePermission(id: string): Promise<void> {
  await authFetch(`/api/admin/permissions/${id}`, { method: 'DELETE' });
}
