import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type KnowledgeBaseType = 'page_index' | 'rag';

export type KnowledgeBaseCapabilities = {
  import: boolean;
  index: boolean;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  type: KnowledgeBaseType;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  capabilities: KnowledgeBaseCapabilities;
  item_count?: number;
};

export type KbItem = {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  document_name: string;
  channel_path: string;
  original_s3_key: string;
  original_download_path: string;
  metadata?: Record<string, unknown> | null;
  page_index?: Record<string, unknown> | null;
  markdown?: string | null;
  parsing_result?: Record<string, unknown> | null;
  import_status: string;
  import_error: string | null;
  import_warnings: string[] | null;
  imported_at: string | null;
  created_at: string;
  updated_at: string;
};

export type KbImportJob = {
  id: string;
  knowledge_base_id: string;
  status: string;
  document_ids: string[];
  total_count: number;
  completed_count: number;
  failed_count: number;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportSourceChannel = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

export type ImportSourceDocument = {
  id: string;
  name: string;
  file_type: string;
  status: string;
  updated_at: string;
};

export type ImportSources = {
  channels: ImportSourceChannel[];
  documents_by_channel: Record<string, ImportSourceDocument[]>;
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

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const data = await authFetch('/api/knowledge-bases');
  return (data.items as KnowledgeBase[]) ?? [];
}

export async function createKnowledgeBase(input: {
  name: string;
  description?: string;
  type: KnowledgeBaseType;
}): Promise<KnowledgeBase> {
  const data = await authFetch('/api/knowledge-bases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? null,
      type: input.type,
    }),
  });
  return data as KnowledgeBase;
}

export async function updateKnowledgeBase(
  id: string,
  input: { name: string; description?: string | null },
): Promise<KnowledgeBase> {
  const data = await authFetch(`/api/knowledge-bases/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? null,
    }),
  });
  return data as KnowledgeBase;
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  await authFetch(`/api/knowledge-bases/${id}`, { method: 'DELETE' });
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const data = await authFetch(`/api/knowledge-bases/${id}`);
  return data as KnowledgeBase;
}

export async function listKbItems(
  knowledgeBaseId: string,
  options?: { offset?: number; limit?: number; includeContent?: boolean },
): Promise<{ items: KbItem[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.includeContent) params.set('include_content', 'true');
  const qs = params.toString();
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/items${qs ? `?${qs}` : ''}`);
  return data as { items: KbItem[]; total: number };
}

export async function getKbItem(knowledgeBaseId: string, itemId: string): Promise<KbItem> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/items/${itemId}`);
  return data as KbItem;
}

export async function deleteKbItem(knowledgeBaseId: string, itemId: string): Promise<void> {
  await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/items/${itemId}`, { method: 'DELETE' });
}

export async function deleteKbItems(knowledgeBaseId: string, itemIds: string[]): Promise<number> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/items/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_ids: itemIds }),
  });
  return (data.deleted_count as number) ?? itemIds.length;
}

export async function fetchImportSources(): Promise<ImportSources> {
  const data = await authFetch('/api/knowledge-bases/import-sources');
  return data as ImportSources;
}

export async function startKbImport(
  knowledgeBaseId: string,
  input: { channelIds?: string[]; documentIds?: string[] },
): Promise<{ job: KbImportJob; document_count: number }> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_ids: input.channelIds ?? [],
      document_ids: input.documentIds ?? [],
    }),
  });
  return data as { job: KbImportJob; document_count: number };
}

export async function getKbImportJob(knowledgeBaseId: string, jobId: string): Promise<KbImportJob> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/import-jobs/${jobId}`);
  return data as KbImportJob;
}

export type ImportSourceChannelNode = ImportSourceChannel & { children: ImportSourceChannelNode[] };

export function buildChannelTree(channels: ImportSourceChannel[]): ImportSourceChannelNode[] {
  const nodes = new Map<string, ImportSourceChannelNode>();
  for (const ch of channels) {
    nodes.set(ch.id, { ...ch, children: [] });
  }
  const roots: ImportSourceChannelNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function collectDescendantChannelIds(
  rootId: string,
  channels: ImportSourceChannel[],
): Set<string> {
  const childrenByParent = new Map<string | null, string[]>();
  for (const ch of channels) {
    const list = childrenByParent.get(ch.parent_id) ?? [];
    list.push(ch.id);
    childrenByParent.set(ch.parent_id, list);
  }
  const result = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return result;
}
