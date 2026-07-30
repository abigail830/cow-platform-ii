import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type DocumentPipelineJob = {
  id: string;
  stage: string;
  pipeline_name: string;
  error_message: string | null;
  external_job_id: string | null;
  updated_at: string;
};

export type DocumentRecord = {
  id: string;
  channel_id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  file_hash: string;
  s3_key: string;
  status: string;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  pipeline_job: DocumentPipelineJob | null;
};

export type DocumentListResponse = {
  items: DocumentRecord[];
  total: number;
};

export const CHUNK_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

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

export type DocumentContentResponse = {
  id: string;
  name: string;
  file_type: string;
  status: string;
  metadata: Record<string, unknown>;
  markdown: string | null;
  page_index: Record<string, unknown> | null;
  has_markdown: boolean;
  has_page_index: boolean;
};

export async function getDocument(id: string): Promise<DocumentRecord> {
  const data = await authFetch(`/api/documents/${id}`);
  return data as DocumentRecord;
}

export async function fetchDocumentContent(id: string): Promise<DocumentContentResponse> {
  const data = await authFetch(`/api/documents/${id}/content`);
  return data as DocumentContentResponse;
}

export async function listDocuments(params: {
  channelId: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<DocumentListResponse> {
  const query = new URLSearchParams();
  query.set('channel_id', params.channelId);
  if (params.search) query.set('search', params.search);
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const data = await authFetch(`/api/documents?${query.toString()}`);
  return data as DocumentListResponse;
}

export async function deleteDocument(id: string): Promise<void> {
  await authFetch(`/api/documents/${id}`, { method: 'DELETE' });
}

export async function downloadDocument(id: string): Promise<void> {
  const data = await authFetch(`/api/documents/${id}/download`);
  const url = data.url as string;
  const filename = (data.filename as string) || 'download';
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener noreferrer';
  anchor.target = '_blank';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function moveDocument(id: string, channelId: string): Promise<DocumentRecord> {
  const data = await authFetch(`/api/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_id: channelId }),
  });
  return data as DocumentRecord;
}

export async function runDocumentPipeline(id: string): Promise<{ status: string }> {
  const data = await authFetch(`/api/documents/${id}/run-pipeline`, { method: 'POST' });
  return data as { status: string };
}

async function uploadSingleFile(channelId: string, file: File): Promise<DocumentRecord> {
  const form = new FormData();
  form.append('channel_id', channelId);
  form.append('file', file);
  const data = await authFetch('/api/documents/upload', { method: 'POST', body: form });
  return data as DocumentRecord;
}

async function uploadFileInChunks(channelId: string, file: File): Promise<DocumentRecord> {
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

    const data = await authFetch('/api/documents/upload-chunk', { method: 'POST', body: form });
    if (data.upload_id && typeof data.upload_id === 'string') {
      uploadId = data.upload_id;
      continue;
    }
    return data as DocumentRecord;
  }

  throw new Error('Chunk upload did not complete');
}

export async function uploadDocument(channelId: string, file: File): Promise<DocumentRecord> {
  if (file.size > CHUNK_UPLOAD_THRESHOLD_BYTES) {
    return uploadFileInChunks(channelId, file);
  }
  return uploadSingleFile(channelId, file);
}

export function formatDocumentBytes(size: number): string {
  if (size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
