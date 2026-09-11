import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';
import type { ResourcePermissionFlags } from './resourceAccess.ts';
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

export type DocumentChannel = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  pipeline_id: string | null;
  transcription_pipeline_id: string | null;
  post_process_pipeline_id: string | null;
  auto_start_pipeline: boolean;
  asr_vocabulary_id?: string | null;
  asr_vocabulary_target_model?: string | null;
  asr_vocabulary_synced_at?: string | null;
  created_at: string;
  updated_at: string;
  my_access?: ResourcePermissionFlags;
  children: DocumentChannel[];
};

/** @deprecated legacy shape — use KnowledgeChannelProcessingOptions */
export type ChannelProcessingOptions = {
  pipelines: Array<{ id: string; name: string; pipelineName: string }>;
};

export type KnowledgeChannelProcessingOptions = {
  documentPipelines: Array<{ id: string; name: string; pipelineName: string }>;
  transcriptionPipelines: Array<{ id: string; name: string; pipelineName: string }>;
  postProcessPipelines: Array<{ id: string; name: string; pipelineName: string }>;
};

/** Default document parse for PDF/images/Office uploads in knowledge channels. */
export const DEFAULT_KNOWLEDGE_DOCUMENT_PIPELINE_NAME = 'aliyun-docmind-parse';

/** Default ASR for audio/transcript captures in document knowledge channels. */
export const DEFAULT_KNOWLEDGE_TRANSCRIPTION_PIPELINE_NAME = 'aliyun-qwen-audio-transcribe';

/** Capture post-process for audio/transcript captures (only supported option today). */
export const DEFAULT_KNOWLEDGE_POST_PROCESS_PIPELINE_NAME = 'audio-capture-post-process';

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
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Network error (${detail}). Check API connectivity and try again.`);
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid API response (${res.status})`);
    }
  }
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

function mapPipelineOptions(
  items: Array<{ id: string; name: string; pipelineName: string }> | undefined,
) {
  return (items ?? []).map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    pipelineName: pipeline.pipelineName,
  }));
}

export async function listDocumentChannels(): Promise<DocumentChannel[]> {
  const data = await authFetch('/api/knowledge/document-channels');
  return (data.channels as DocumentChannel[]) ?? [];
}

export async function fetchChannelProcessingOptions(): Promise<KnowledgeChannelProcessingOptions> {
  const data = await authFetch('/api/knowledge/document-channels/processing-options');
  return {
    documentPipelines: mapPipelineOptions(
      (data.document_pipelines as KnowledgeChannelProcessingOptions['documentPipelines']) ??
        (data.pipelines as KnowledgeChannelProcessingOptions['documentPipelines']),
    ),
    transcriptionPipelines: mapPipelineOptions(
      data.transcription_pipelines as KnowledgeChannelProcessingOptions['transcriptionPipelines'],
    ),
    postProcessPipelines: mapPipelineOptions(
      data.post_process_pipelines as KnowledgeChannelProcessingOptions['postProcessPipelines'],
    ),
  };
}

export async function fetchDocumentChannelAsrHotwords(
  channelId: string,
): Promise<ChannelAsrHotwordsResponse> {
  const data = await authFetch(`/api/knowledge/document-channels/${channelId}/hotwords`);
  return data as ChannelAsrHotwordsResponse;
}

export async function createDocumentChannel(input: {
  name: string;
  description?: string;
  parentId?: string | null;
}): Promise<DocumentChannel> {
  const data = await authFetch('/api/knowledge/document-channels', {
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
    transcriptionPipelineId?: string | null;
    postProcessPipelineId?: string | null;
    autoStartPipeline?: boolean;
  },
): Promise<DocumentChannel> {
  const data = await authFetch(`/api/knowledge/document-channels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      parent_id: input.parentId,
      pipeline_id: input.pipelineId,
      transcription_pipeline_id: input.transcriptionPipelineId,
      post_process_pipeline_id: input.postProcessPipelineId,
      auto_start_pipeline: input.autoStartPipeline,
    }),
  });
  return data as DocumentChannel;
}

export async function deleteDocumentChannel(id: string): Promise<void> {
  await authFetch(`/api/knowledge/document-channels/${id}`, { method: 'DELETE' });
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
