import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type StorageInfo = {
  bucket: string;
  storage_enabled: boolean;
};

export type StorageFolder = {
  prefix: string;
};

export type StorageObject = {
  key: string;
  size: number;
  last_modified: string | null;
};

export type StorageListResponse = {
  prefix: string;
  folders: StorageFolder[];
  objects: StorageObject[];
  next_continuation_token: string | null;
  truncated: boolean;
};

export type MoveItem = {
  type: 'prefix' | 'object';
  key: string;
};

export type MoveResult = {
  moved_count: number;
  skipped_count: number;
  errors: string[];
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

export async function getStorageInfo(): Promise<StorageInfo> {
  const data = await authFetch('/api/console/storage');
  return data as StorageInfo;
}

export async function listStorageObjects(params?: {
  prefix?: string;
  continuationToken?: string;
  maxKeys?: number;
}): Promise<StorageListResponse> {
  const query = new URLSearchParams();
  if (params?.prefix !== undefined) query.set('prefix', params.prefix);
  if (params?.continuationToken) query.set('continuation_token', params.continuationToken);
  if (params?.maxKeys) query.set('max_keys', String(params.maxKeys));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authFetch(`/api/console/storage/objects${suffix}`);
  return data as StorageListResponse;
}

export async function createStorageFolder(parentPrefix: string, name: string): Promise<{ prefix: string }> {
  const data = await authFetch('/api/console/storage/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_prefix: parentPrefix, name }),
  });
  return data as { prefix: string };
}

export async function moveStorageItems(input: {
  items: MoveItem[];
  destinationPrefix: string;
  deleteSource?: boolean;
}): Promise<MoveResult> {
  const data = await authFetch('/api/console/storage/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: input.items,
      destination_prefix: input.destinationPrefix,
      delete_source: input.deleteSource,
    }),
  });
  return data as MoveResult;
}

export function formatBytes(size: number): string {
  if (size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function folderLabel(prefix: string): string {
  const trimmed = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const idx = trimmed.lastIndexOf('/');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

export function objectLabel(key: string): string {
  const idx = key.lastIndexOf('/');
  return idx >= 0 ? key.slice(idx + 1) : key;
}

export function breadcrumbSegments(prefix: string): Array<{ label: string; prefix: string }> {
  const normalized = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (!normalized) return [];
  const parts = normalized.split('/').filter(Boolean);
  const segments: Array<{ label: string; prefix: string }> = [];
  let current = '';
  for (const part of parts) {
    current = `${current}${part}/`;
    segments.push({ label: part, prefix: current });
  }
  return segments;
}
