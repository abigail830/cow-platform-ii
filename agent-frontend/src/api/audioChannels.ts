import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { readApiErrorMessage } from './http.ts';
import type { ResourcePermissionFlags } from './resourceAccess.ts';

export type AudioChannel = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  pipeline_id: string | null;
  post_process_pipeline_id: string | null;
  auto_start_pipeline: boolean;
  created_at: string;
  updated_at: string;
  my_access?: ResourcePermissionFlags;
  children: AudioChannel[];
};

export type AudioChannelProcessingOptions = {
  transcriptionPipelines: Array<{ id: string; name: string; pipelineName: string }>;
  postProcessPipelines: Array<{ id: string; name: string; pipelineName: string }>;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    throw new Error(message === 'Failed to fetch' ? 'Network error — is the backend running?' : message);
  }
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  if (res.status === 204) return {};
  return res.json() as Promise<Record<string, unknown>>;
}

export async function listAudioChannels(): Promise<AudioChannel[]> {
  const data = await authFetch('/api/audio-channels');
  return (data.channels as AudioChannel[]) ?? [];
}

export async function fetchAudioChannelProcessingOptions(): Promise<AudioChannelProcessingOptions> {
  const data = await authFetch('/api/audio-channels/processing-options');
  return {
    transcriptionPipelines:
      (data.transcription_pipelines as AudioChannelProcessingOptions['transcriptionPipelines']) ?? [],
    postProcessPipelines:
      (data.post_process_pipelines as AudioChannelProcessingOptions['postProcessPipelines']) ?? [],
  };
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
    postProcessPipelineId?: string | null;
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
      post_process_pipeline_id: input.postProcessPipelineId,
      auto_start_pipeline: input.autoStartPipeline,
    }),
  });
  return data as AudioChannel;
}

export type ChannelAsrHotwordsResponse = {
  hotwords: Array<{
    id: string;
    text: string;
    weight: number;
    lang: string | null;
    note: string | null;
    channel_ids: string[];
    created_at: string;
    updated_at: string;
  }>;
  asr_vocabulary_id: string | null;
  asr_vocabulary_target_model: string | null;
  asr_vocabulary_synced_at: string | null;
};

export async function fetchChannelAsrHotwords(channelId: string): Promise<ChannelAsrHotwordsResponse> {
  const data = await authFetch(`/api/audio-channels/${channelId}/hotwords`);
  return {
    hotwords: (data.hotwords as ChannelAsrHotwordsResponse['hotwords']) ?? [],
    asr_vocabulary_id: (data.asr_vocabulary_id as string | null) ?? null,
    asr_vocabulary_target_model: (data.asr_vocabulary_target_model as string | null) ?? null,
    asr_vocabulary_synced_at: (data.asr_vocabulary_synced_at as string | null) ?? null,
  };
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
