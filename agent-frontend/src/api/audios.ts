import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type AudioPipelineJob = {
  id: string;
  stage: string;
  pipeline_name: string;
  error_message: string | null;
  external_job_id: string | null;
  updated_at: string;
};

export type AudioRecord = {
  id: string;
  channel_id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  file_hash: string;
  s3_key: string;
  status: string;
  duration_sec: number | null;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  pipeline_job: AudioPipelineJob | null;
};

const CHUNK_THRESHOLD = 10 * 1024 * 1024;

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

export function formatAudioBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listAudios(input: {
  channelId: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<{ items: AudioRecord[]; total: number }> {
  const params = new URLSearchParams({ channel_id: input.channelId });
  if (input.search) params.set('search', input.search);
  if (input.offset !== undefined) params.set('offset', String(input.offset));
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  const data = await authFetch(`/api/audios?${params.toString()}`);
  return {
    items: (data.items as AudioRecord[]) ?? [],
    total: Number(data.total ?? 0),
  };
}

export async function getAudio(id: string): Promise<AudioRecord> {
  const data = await authFetch(`/api/audios/${id}`);
  return data as AudioRecord;
}

export async function getAudioTranscript(id: string): Promise<{
  status: string;
  has_transcript: boolean;
  transcript: string | null;
}> {
  const data = await authFetch(`/api/audios/${id}/transcript`);
  return data as {
    status: string;
    has_transcript: boolean;
    transcript: string | null;
  };
}

export async function getAudioDownloadUrl(id: string): Promise<{ url: string; filename: string }> {
  const data = await authFetch(`/api/audios/${id}/download`);
  return {
    url: String(data.url),
    filename: String(data.filename),
  };
}

export async function uploadAudio(channelId: string, file: File): Promise<AudioRecord> {
  if (file.size > CHUNK_THRESHOLD) {
    return uploadAudioChunked(channelId, file);
  }
  const form = new FormData();
  form.append('channel_id', channelId);
  form.append('file', file);
  const data = await authFetch('/api/audios/upload', { method: 'POST', body: form });
  return data as AudioRecord;
}

async function uploadAudioChunked(channelId: string, file: File): Promise<AudioRecord> {
  const chunkSize = CHUNK_THRESHOLD;
  const totalChunks = Math.ceil(file.size / chunkSize);
  let uploadId = '';

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    const form = new FormData();
    form.append('channel_id', channelId);
    form.append('filename', file.name);
    form.append('chunk_index', String(index));
    form.append('total_chunks', String(totalChunks));
    form.append('file_chunk', chunk, file.name);
    if (uploadId) form.append('upload_id', uploadId);

    const data = await authFetch('/api/audios/upload-chunk', { method: 'POST', body: form });
    if (data.upload_id && !uploadId) uploadId = String(data.upload_id);
    if (data.id) return data as AudioRecord;
  }

  throw new Error('Chunked upload did not complete');
}

export async function deleteAudio(id: string): Promise<void> {
  await authFetch(`/api/audios/${id}`, { method: 'DELETE' });
}

export async function runAudioPipeline(id: string): Promise<{ status: string; job_id?: string }> {
  const data = await authFetch(`/api/audios/${id}/run-pipeline`, { method: 'POST' });
  return data as { status: string; job_id?: string };
}
