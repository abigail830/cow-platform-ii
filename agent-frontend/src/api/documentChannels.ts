import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type DocumentChannel = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  pipeline_id: string | null;
  auto_start_pipeline: boolean;
  metadata_extraction_model_id: string | null;
  created_at: string;
  updated_at: string;
  children: DocumentChannel[];
};

export type ChannelProcessingOptions = {
  pipelines: Array<{ id: string; name: string; pipelineName: string }>;
  extractionModels: Array<{ id: string; name: string; isDefault: boolean }>;
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

export async function listDocumentChannels(): Promise<DocumentChannel[]> {
  const data = await authFetch('/api/document-channels');
  return (data.channels as DocumentChannel[]) ?? [];
}

export async function fetchChannelProcessingOptions(): Promise<ChannelProcessingOptions> {
  const data = await authFetch('/api/document-channels/processing-options');
  return data as ChannelProcessingOptions;
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
  input: {
    name?: string;
    description?: string | null;
    parentId?: string | null;
    pipelineId?: string | null;
    metadataExtractionModelId?: string | null;
    autoStartPipeline?: boolean;
  },
): Promise<DocumentChannel> {
  const data = await authFetch(`/api/document-channels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      parent_id: input.parentId,
      pipeline_id: input.pipelineId,
      metadata_extraction_model_id: input.metadataExtractionModelId,
      auto_start_pipeline: input.autoStartPipeline,
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
