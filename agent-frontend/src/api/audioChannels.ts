import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';
import type { ResourcePermissionFlags } from './resourceAccess.ts';

export type AudioChannel = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  pipeline_id: string | null;
  auto_start_pipeline: boolean;
  created_at: string;
  updated_at: string;
  my_access?: ResourcePermissionFlags;
  children: AudioChannel[];
};

export type ChannelProcessingOptions = {
  pipelines: Array<{ id: string; name: string; pipelineName: string }>;
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

export async function listAudioChannels(): Promise<AudioChannel[]> {
  const data = await authFetch('/api/audio-channels');
  return (data.channels as AudioChannel[]) ?? [];
}

export async function fetchAudioChannelProcessingOptions(): Promise<ChannelProcessingOptions> {
  const data = await authFetch('/api/audio-channels/processing-options');
  return data as ChannelProcessingOptions;
}

export async function createAudioChannel(input: {
  name: string;
  description?: string;
  parentId?: string | null;
}): Promise<AudioChannel> {
  const data = await authFetch('/api/audio-channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      parent_id: input.parentId ?? null,
    }),
  });
  return data as AudioChannel;
}

export async function updateAudioChannel(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    parentId?: string | null;
    pipelineId?: string | null;
    autoStartPipeline?: boolean;
  },
): Promise<AudioChannel> {
  const data = await authFetch(`/api/audio-channels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      parent_id: input.parentId,
      pipeline_id: input.pipelineId,
      auto_start_pipeline: input.autoStartPipeline,
    }),
  });
  return data as AudioChannel;
}

export async function deleteAudioChannel(id: string): Promise<void> {
  await authFetch(`/api/audio-channels/${id}`, { method: 'DELETE' });
}

export function flattenAudioChannels(channels: AudioChannel[]): AudioChannel[] {
  const result: AudioChannel[] = [];
  function walk(nodes: AudioChannel[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) walk(node.children);
    }
  }
  walk(channels);
  return result;
}
