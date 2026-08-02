import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type UserApiKeyItem = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
};

export type CreateUserApiKeyResponse = {
  key: string;
  item: {
    id: string;
    name: string;
    key_prefix: string;
    created_at: string;
  };
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function listUserApiKeys(): Promise<UserApiKeyItem[]> {
  const data = await authFetch('/api/user/api-keys');
  return (data.items as UserApiKeyItem[]) ?? [];
}

export async function createUserApiKey(name?: string): Promise<CreateUserApiKeyResponse> {
  return (await authFetch('/api/user/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name?.trim() || undefined }),
  })) as CreateUserApiKeyResponse;
}

export async function revokeUserApiKey(id: string): Promise<void> {
  await authFetch(`/api/user/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
