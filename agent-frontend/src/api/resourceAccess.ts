import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type ResourcePermissionFlags = {
  read: boolean;
  write: boolean;
  manage: boolean;
};

export type ResourceAccessUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type ResourceAccessGrantRow = {
  userId: string;
  email: string;
  displayName: string | null;
  read: boolean;
  write: boolean;
  manage: boolean;
};

export type ResourceAccessSettings = {
  owner: ResourceAccessUser | null;
  others: ResourcePermissionFlags;
  users: ResourceAccessGrantRow[];
  my_access: ResourcePermissionFlags;
};

export type ResourceType = 'document_channel' | 'audio_channel' | 'knowledge_base' | 'skill';

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

function accessPath(resourceType: ResourceType, resourceId: string): string {
  if (resourceType === 'document_channel') {
    return `/api/document-channels/${resourceId}/access`;
  }
  if (resourceType === 'audio_channel') {
    return `/api/audio-channels/${resourceId}/access`;
  }
  if (resourceType === 'skill') {
    return `/api/studio/skills/${encodeURIComponent(resourceId)}/access`;
  }
  return `/api/knowledge-bases/${resourceId}/access`;
}

export async function fetchResourceAccess(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ResourceAccessSettings> {
  const data = await authFetch(accessPath(resourceType, resourceId));
  return data as ResourceAccessSettings;
}

export async function saveResourceAccess(
  resourceType: ResourceType,
  resourceId: string,
  input: {
    others: ResourcePermissionFlags;
    users: Array<{ userId: string; read: boolean; write: boolean; manage: boolean }>;
  },
): Promise<ResourceAccessSettings> {
  const data = await authFetch(accessPath(resourceType, resourceId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data as ResourceAccessSettings;
}

export async function transferResourceOwner(
  resourceType: ResourceType,
  resourceId: string,
  userId: string,
): Promise<ResourceAccessSettings> {
  const path =
    resourceType === 'document_channel'
      ? `/api/document-channels/${resourceId}/access/transfer-owner`
      : resourceType === 'audio_channel'
        ? `/api/audio-channels/${resourceId}/access/transfer-owner`
        : `/api/knowledge-bases/${resourceId}/access/transfer-owner`;
  const data = await authFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  return data as ResourceAccessSettings;
}

export async function lookupUsersForSharing(search?: string): Promise<ResourceAccessUser[]> {
  const suffix = search?.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  const data = await authFetch(`/api/users/lookup${suffix}`);
  return (data.users as ResourceAccessUser[]) ?? [];
}

export function resourcePermissionLabel(flags: ResourcePermissionFlags): string {
  const parts: string[] = [];
  if (flags.read) parts.push('r');
  if (flags.write) parts.push('w');
  if (flags.manage) parts.push('m');
  return parts.length > 0 ? parts.join('') : '—';
}

export function normalizeResourceFlags(flags: ResourcePermissionFlags): ResourcePermissionFlags {
  const manage = flags.manage;
  const write = manage || flags.write;
  const read = write || flags.read;
  return { read, write, manage };
}
