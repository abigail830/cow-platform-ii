import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';
import { putFileToPresignedUrl } from './direct-upload.ts';
import { fetchPresignedListXml, parseListObjectsV2Xml } from './storage-list-xml.ts';

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

type PresignedMoveOperation = {
  kind: 'copy' | 'delete';
  url: string;
  method: 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  source_key: string;
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

async function fetchStorageListing(params: {
  prefix?: string;
  continuationToken?: string;
  maxKeys?: number;
  recursive?: boolean;
  signal?: AbortSignal;
}): Promise<StorageListResponse> {
  const query = new URLSearchParams();
  if (params.prefix !== undefined) query.set('prefix', params.prefix);
  if (params.continuationToken) query.set('continuation_token', params.continuationToken);
  if (params.maxKeys) query.set('max_keys', String(params.maxKeys));
  if (params.recursive) query.set('recursive', 'true');
  const suffix = query.toString() ? `?${query.toString()}` : '';

  const manifest = (await authFetch(`/api/console/storage/objects${suffix}`)) as {
    list_url: string;
    prefix: string;
  };
  const xml = await fetchPresignedListXml(manifest.list_url, params.signal);
  return parseListObjectsV2Xml(xml, manifest.prefix ?? params.prefix ?? '');
}

export async function listStorageObjects(params?: {
  prefix?: string;
  continuationToken?: string;
  maxKeys?: number;
  signal?: AbortSignal;
}): Promise<StorageListResponse> {
  return fetchStorageListing({
    prefix: params?.prefix,
    continuationToken: params?.continuationToken,
    maxKeys: params?.maxKeys,
    signal: params?.signal,
  });
}

async function listAllKeysUnderPrefix(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await fetchStorageListing({
      prefix,
      continuationToken,
      maxKeys: 200,
      recursive: true,
    });
    keys.push(...page.objects.map((object) => object.key));
    continuationToken = page.next_continuation_token ?? undefined;
  } while (continuationToken);
  return keys;
}

export async function createStorageFolder(parentPrefix: string, name: string): Promise<{ prefix: string }> {
  const data = (await authFetch('/api/console/storage/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_prefix: parentPrefix, name }),
  })) as { upload_url: string; prefix: string };

  await putFileToPresignedUrl(
    data.upload_url,
    new Blob([], { type: 'application/octet-stream' }),
    { 'Content-Type': 'application/octet-stream' },
  );
  return { prefix: data.prefix };
}

async function executePresignedMoveOperation(operation: PresignedMoveOperation): Promise<void> {
  let res: Response;
  try {
    res = await fetch(operation.url, {
      method: operation.method,
      headers: operation.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Move failed';
    throw new Error(
      message === 'Failed to fetch'
        ? `${operation.source_key}: move failed (network/CORS). Allow PUT and DELETE from your frontend origin in OSS CORS.`
        : `${operation.source_key}: ${message}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const snippet = body.replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(
      `${operation.source_key}: move failed (HTTP ${res.status})${snippet ? `: ${snippet}` : ''}`,
    );
  }
}

export async function moveStorageItems(input: {
  items: MoveItem[];
  destinationPrefix: string;
  deleteSource?: boolean;
}): Promise<MoveResult> {
  const folderObjectKeys: Record<string, string[]> = {};
  for (const item of input.items) {
    if (item.type !== 'prefix') continue;
    const normalized = item.key.endsWith('/') ? item.key : `${item.key}/`;
    folderObjectKeys[normalized] = await listAllKeysUnderPrefix(normalized);
  }

  const data = (await authFetch('/api/console/storage/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: input.items,
      destination_prefix: input.destinationPrefix,
      delete_source: input.deleteSource,
      folder_object_keys: folderObjectKeys,
    }),
  })) as {
    operations: PresignedMoveOperation[];
    skipped_count: number;
    errors: string[];
  };

  const errors = [...(data.errors ?? [])];
  let movedCount = 0;
  for (const operation of data.operations ?? []) {
    try {
      await executePresignedMoveOperation(operation);
      if (operation.kind === 'copy') movedCount += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Move failed');
    }
  }

  return {
    moved_count: movedCount,
    skipped_count: data.skipped_count ?? 0,
    errors,
  };
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
