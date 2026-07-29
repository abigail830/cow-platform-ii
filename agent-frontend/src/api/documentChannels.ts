import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type DocumentChannel = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children: DocumentChannel[];
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

export async function listDocumentChannels(): Promise<DocumentChannel[]> {
  const data = await authFetch('/api/document-channels');
  return (data.channels as DocumentChannel[]) ?? [];
}

export async function createDocumentChannel(input: {
  name: string;
  description?: string;
  parentId?: string | null;
}): Promise<DocumentChannel> {
  const data = await authFetch('/api/document-channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      parent_id: input.parentId ?? null,
    }),
  });
  return data as DocumentChannel;
}

export async function updateDocumentChannel(
  id: string,
  input: { name?: string; description?: string | null; parentId?: string | null },
): Promise<DocumentChannel> {
  const data = await authFetch(`/api/document-channels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      parent_id: input.parentId,
    }),
  });
  return data as DocumentChannel;
}

export async function deleteDocumentChannel(id: string): Promise<void> {
  await authFetch(`/api/document-channels/${id}`, { method: 'DELETE' });
}

export function flattenChannels(channels: DocumentChannel[]): DocumentChannel[] {
  const result: DocumentChannel[] = [];
  function walk(nodes: DocumentChannel[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) walk(node.children);
    }
  }
  walk(channels);
  return result;
}
