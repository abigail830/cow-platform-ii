import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';
import { sha256HexFromFile } from '../shared/file-hash.ts';

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

/** Below Vercel serverless body limit (~4.5 MB); use direct OSS upload above this. */
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 3.5 * 1024 * 1024;
export const CHUNK_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

function usesRemoteApiOrigin(): boolean {
  return Boolean(import.meta.env.VITE_API_ORIGIN?.trim());
}

function shouldUseDirectUpload(file: File): boolean {
  return usesRemoteApiOrigin() || file.size > DIRECT_UPLOAD_THRESHOLD_BYTES;
}

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
    const message = error instanceof Error ? error.message : 'Network request failed';
    if (message === 'Failed to fetch') {
      throw new Error(
        'Upload request failed (network error). For production, ensure OSS CORS allows PUT from your frontend origin.',
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Unexpected server response (${res.status})`);
    }
  }
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

type UploadInitResponse = {
  s3_key: string;
  file_hash: string;
  upload_url?: string;
  method?: string;
  headers?: Record<string, string>;
  skip_upload?: boolean;
};

async function uploadAudioDirect(channelId: string, file: File): Promise<AudioRecord> {
  const fileHash = await sha256HexFromFile(file);
  const init = (await authFetch('/api/audios/upload-init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: channelId,
      filename: file.name,
      file_hash: fileHash,
      size_bytes: file.size,
      content_type: file.type || undefined,
    }),
  })) as UploadInitResponse;

  if (!init.skip_upload) {
    const uploadUrl = init.upload_url;
    if (!uploadUrl) throw new Error('Server did not return an upload URL');

    const headers = init.headers ?? {};
    let putRes: Response;
    try {
      putRes = await fetch(uploadUrl, {
        method: init.method ?? 'PUT',
        body: file,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Direct storage upload failed';
      if (message === 'Failed to fetch') {
        throw new Error(
          'Direct storage upload failed (network/CORS). In Aliyun OSS CORS, allow PUT from your frontend origin.',
        );
      }
      throw error instanceof Error ? error : new Error(message);
    }

    if (!putRes.ok) {
      throw new Error(`Direct storage upload failed (HTTP ${putRes.status})`);
    }
  }

  const data = await authFetch('/api/audios/upload-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: channelId,
      filename: file.name,
      file_hash: init.file_hash ?? fileHash,
      s3_key: init.s3_key,
      size_bytes: file.size,
    }),
  });
  return data as AudioRecord;
}

export async function uploadAudio(channelId: string, file: File): Promise<AudioRecord> {
  if (shouldUseDirectUpload(file)) {
    return uploadAudioDirect(channelId, file);
  }
  if (file.size > CHUNK_UPLOAD_THRESHOLD_BYTES) {
    return uploadAudioInChunks(channelId, file);
  }
  return uploadSingleAudio(channelId, file);
}

async function uploadSingleAudio(channelId: string, file: File): Promise<AudioRecord> {
  const form = new FormData();
  form.append('channel_id', channelId);
  form.append('file', file);
  const data = await authFetch('/api/audios/upload', { method: 'POST', body: form });
  return data as AudioRecord;
}

async function uploadAudioInChunks(channelId: string, file: File): Promise<AudioRecord> {
  const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_SIZE_BYTES);
  let uploadId = '';

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * UPLOAD_CHUNK_SIZE_BYTES;
    const end = Math.min(start + UPLOAD_CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(start, end);

    const form = new FormData();
    form.append('channel_id', channelId);
    form.append('filename', file.name);
    form.append('chunk_index', String(chunkIndex));
    form.append('total_chunks', String(totalChunks));
    form.append('file_chunk', chunk, file.name);
    if (uploadId) form.append('upload_id', uploadId);

    const data = await authFetch('/api/audios/upload-chunk', { method: 'POST', body: form });
    if (data.upload_id && typeof data.upload_id === 'string') {
      uploadId = data.upload_id;
      continue;
    }
    return data as AudioRecord;
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
