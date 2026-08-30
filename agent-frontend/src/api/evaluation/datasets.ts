import { apiUrl } from '../base.ts';
import { getToken } from '../auth.ts';
import { formatApiError } from '../http.ts';
import { sha256HexFromFile } from '../../shared/file-hash.ts';
import { putFileToPresignedUrl } from '../direct-upload.ts';
import { readAudioDurationSec } from '../../shared/audio-duration.ts';
import { datasetItemDurationSec } from '../../shared/reference-import.ts';

export type EvalDataset = {
  id: string;
  name: string;
  description: string | null;
  kind: 'test' | 'annotation';
  media_type: 'audio' | 'document';
  item_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EvalDatasetItem = {
  id: string;
  dataset_id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  file_hash: string;
  s3_key: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  reference_s3_key: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
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

export function formatEvalFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function evalDatasetItemDurationSec(item: EvalDatasetItem): number | null {
  return datasetItemDurationSec(item.metadata);
}

export async function listEvalDatasets(): Promise<EvalDataset[]> {
  const data = await authFetch('/api/evaluation/datasets');
  return (data.datasets as EvalDataset[]) ?? [];
}

export async function getEvalDataset(id: string): Promise<EvalDataset> {
  const data = await authFetch(`/api/evaluation/datasets/${id}`);
  return data as EvalDataset;
}

export async function createEvalDataset(input: {
  name: string;
  description?: string;
}): Promise<EvalDataset> {
  const data = await authFetch('/api/evaluation/datasets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data as EvalDataset;
}

export async function updateEvalDataset(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<EvalDataset> {
  const data = await authFetch(`/api/evaluation/datasets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data as EvalDataset;
}

export async function deleteEvalDataset(id: string): Promise<void> {
  await authFetch(`/api/evaluation/datasets/${id}`, { method: 'DELETE' });
}

export async function listEvalDatasetItems(datasetId: string): Promise<EvalDatasetItem[]> {
  const data = await authFetch(`/api/evaluation/datasets/${datasetId}/items`);
  return (data.items as EvalDatasetItem[]) ?? [];
}

export async function deleteEvalDatasetItem(datasetId: string, itemId: string): Promise<void> {
  await authFetch(`/api/evaluation/datasets/${datasetId}/items/${itemId}`, { method: 'DELETE' });
}

export async function getEvalDatasetItemDownloadUrl(
  datasetId: string,
  itemId: string,
): Promise<{ download_url: string; filename: string }> {
  const data = await authFetch(`/api/evaluation/datasets/${datasetId}/items/${itemId}/download-url`);
  return {
    download_url: String(data.download_url),
    filename: String(data.filename),
  };
}

type UploadInitResponse = {
  item_id: string;
  s3_key: string;
  file_hash: string;
  upload_url?: string;
  method?: string;
  headers?: Record<string, string>;
  skip_upload?: boolean;
};

export async function uploadEvalDatasetItem(datasetId: string, file: File): Promise<EvalDatasetItem> {
  const fileHash = await sha256HexFromFile(file);
  const durationSec = await readAudioDurationSec(file);
  const init = (await authFetch(`/api/evaluation/datasets/${datasetId}/items/upload-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      file_hash: fileHash,
      size_bytes: file.size,
      content_type: file.type || undefined,
    }),
  })) as UploadInitResponse;

  if (!init.skip_upload) {
    const uploadUrl = init.upload_url;
    if (!uploadUrl) throw new Error('Server did not return an upload URL');
    await putFileToPresignedUrl(uploadUrl, file, init.headers ?? {}, init.method ?? 'PUT');
  }

  const completed = await authFetch(`/api/evaluation/datasets/${datasetId}/items/upload-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_id: init.item_id,
      filename: file.name,
      file_hash: fileHash,
      s3_key: init.s3_key,
      size_bytes: file.size,
      ...(durationSec != null ? { duration_sec: durationSec } : {}),
    }),
  });

  return completed as EvalDatasetItem;
}

export async function updateEvalDatasetItemDuration(
  datasetId: string,
  itemId: string,
  durationSec: number | null,
  source: 'manual' | 'import' = 'manual',
): Promise<EvalDatasetItem> {
  const data = await authFetch(`/api/evaluation/datasets/${datasetId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration_sec: durationSec, duration_source: source }),
  });
  return data as EvalDatasetItem;
}

type ReferenceUploadInitResponse = {
  s3_key: string;
  upload_url: string;
  method?: string;
  headers?: Record<string, string>;
};

export async function uploadEvalDatasetReference(
  datasetId: string,
  itemId: string,
  referenceText: string,
): Promise<EvalDatasetItem> {
  const blob = new Blob([referenceText], { type: 'text/plain;charset=utf-8' });
  const init = (await authFetch(
    `/api/evaluation/datasets/${datasetId}/items/${itemId}/reference/upload-init`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size_bytes: blob.size }),
    },
  )) as ReferenceUploadInitResponse;

  const uploadUrl = init.upload_url;
  if (!uploadUrl) throw new Error('Server did not return an upload URL');

  await putFileToPresignedUrl(uploadUrl, blob, init.headers ?? {}, init.method ?? 'PUT');

  const completed = await authFetch(
    `/api/evaluation/datasets/${datasetId}/items/${itemId}/reference/upload-complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3_key: init.s3_key }),
    },
  );

  return completed as EvalDatasetItem;
}

export async function getEvalDatasetReferenceDownloadUrl(
  datasetId: string,
  itemId: string,
): Promise<{ download_url: string; filename: string }> {
  const data = await authFetch(
    `/api/evaluation/datasets/${datasetId}/items/${itemId}/reference/download-url`,
  );
  return {
    download_url: String(data.download_url),
    filename: String(data.filename),
  };
}
