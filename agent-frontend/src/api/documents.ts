import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { extractPathsFromParseResult } from './document-bundle-paths.ts';
import { formatApiError } from './http.ts';
import { fetchPresignedStorageText } from './storage-fetch.ts';
import {
  collectRelativeMarkdownImagePaths,
  markdownImagePathCandidates,
  rewriteMarkdownImageUrls,
} from '../shared/markdown-images.ts';
import JSZip from 'jszip';

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
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

type DocumentContentManifest = {
  id: string;
  name: string;
  file_type: string;
  status: string;
  metadata: Record<string, unknown>;
  sources: {
    markdown_url: string;
    page_index_url: string;
    parsing_result_url?: string;
  };
};

export type DocumentContentResponse = {
  id: string;
  name: string;
  file_type: string;
  status: string;
  metadata: Record<string, unknown>;
  markdown: string | null;
  page_index: Record<string, unknown> | null;
  parsing_result: Record<string, unknown> | null;
  has_markdown: boolean;
  has_page_index: boolean;
};

function parseJsonRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getDocument(id: string): Promise<DocumentRecord> {
  const data = await authFetch(`/api/documents/${id}`);
  return data as DocumentRecord;
}

export async function fetchDocumentContent(
  id: string,
  options?: { timeoutMs?: number },
): Promise<DocumentContentResponse> {
  const timeoutMs = options?.timeoutMs;
  const signal =
    timeoutMs && timeoutMs > 0 && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const manifest = (await authFetch(
    `/api/documents/${id}/content`,
    signal ? { signal } : undefined,
  )) as DocumentContentManifest;

  const [markdownRaw, pageIndexRaw, resultRaw] = await Promise.all([
    fetchPresignedStorageText(manifest.sources.markdown_url, signal),
    fetchPresignedStorageText(manifest.sources.page_index_url, signal),
    manifest.sources.parsing_result_url
      ? fetchPresignedStorageText(manifest.sources.parsing_result_url, signal)
      : Promise.resolve(null),
  ]);

  const page_index = parseJsonRecord(pageIndexRaw);
  const parsing_result = parseJsonRecord(resultRaw);
  const markdown = markdownRaw
    ? await resolveDocumentMarkdownImages(id, markdownRaw, signal)
    : null;

  return {
    id: manifest.id,
    name: manifest.name,
    file_type: manifest.file_type,
    status: manifest.status,
    metadata: manifest.metadata,
    markdown,
    page_index,
    parsing_result,
    has_markdown: Boolean(markdown?.trim()),
    has_page_index: page_index !== null,
  };
}

/** Presign relative image paths in parsed markdown so the browser can load them from OSS. */
async function resolveDocumentMarkdownImages(
  documentId: string,
  markdown: string,
  signal?: AbortSignal,
): Promise<string> {
  const relativePaths = collectRelativeMarkdownImagePaths(markdown);
  if (relativePaths.length === 0) return markdown;

  const pathSet = new Set<string>();
  for (const path of relativePaths) {
    for (const candidate of markdownImagePathCandidates(path)) {
      pathSet.add(candidate);
    }
  }

  try {
    const presigned = (await authFetch(`/api/documents/${documentId}/download/bundle-presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: [...pathSet] }),
      signal,
    })) as { files: Array<{ path: string; url: string }> };

    const byStoragePath = new Map<string, string>();
    for (const file of presigned.files ?? []) {
      if (file.path && file.url) byStoragePath.set(file.path, file.url);
    }
    if (byStoragePath.size === 0) return markdown;

    const rewriteMap = new Map<string, string>();
    for (const path of relativePaths) {
      for (const candidate of markdownImagePathCandidates(path)) {
        const url = byStoragePath.get(candidate);
        if (url) {
          rewriteMap.set(path, url);
          break;
        }
      }
    }
    return rewriteMarkdownImageUrls(markdown, rewriteMap);
  } catch {
    // Presign/CORS failures should not block parsed text rendering.
    return markdown;
  }
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
  const { url, filename } = await getDocumentDownloadUrl(id);
  triggerBrowserDownload(url, filename);
}

export async function getDocumentDownloadUrl(id: string): Promise<{ url: string; filename: string }> {
  const data = await authFetch(`/api/documents/${id}/download`);
  return {
    url: data.url as string,
    filename: (data.filename as string) || 'download',
  };
}

function isBrowserBundleFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message === 'Failed to fetch' ||
    message.includes('Could not download any artifacts') ||
    message.includes('object storage CORS')
  );
}

async function downloadDocumentBundleViaServer(
  id: string,
  suggestedFilename: string,
): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(apiUrl(`/api/documents/${id}/download/bundle`), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const filename = suggestedFilename.endsWith('.zip')
    ? suggestedFilename
    : `${suggestedFilename.replace(/\.[^.]+$/, '')}.zip`;
  triggerBrowserDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function downloadDocumentBundleViaBrowser(
  id: string,
  suggestedFilename: string,
): Promise<void> {
  const manifest = (await authFetch(`/api/documents/${id}/download/bundle-manifest`)) as {
    file_hash: string;
    archive_filename: string;
    files: Array<{ path: string; url: string }>;
  };

  const fileMap = new Map<string, string>();
  for (const file of manifest.files) {
    fileMap.set(file.path, file.url);
  }

  const resultFile = manifest.files.find((file) => file.path === 'result.json');
  if (resultFile) {
    try {
      const resultRes = await fetch(resultFile.url);
      if (resultRes.ok) {
        const result = (await resultRes.json()) as Record<string, unknown>;
        const extraPaths = extractPathsFromParseResult(result, manifest.file_hash).filter(
          (path) => !fileMap.has(path),
        );
        if (extraPaths.length > 0) {
          const presigned = (await authFetch(`/api/documents/${id}/download/bundle-presign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: extraPaths }),
          })) as { files: Array<{ path: string; url: string }> };
          for (const file of presigned.files) {
            fileMap.set(file.path, file.url);
          }
        }
      }
    } catch {
      // OSS CORS or network — continue with the standard manifest files only.
    }
  }

  if (fileMap.size === 0) {
    throw new Error('No stored artifacts found for this document');
  }

  const zip = new JSZip();
  let added = 0;
  for (const [path, url] of fileMap) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      zip.file(path, await res.blob());
      added += 1;
    } catch {
      // Skip files the browser cannot read (e.g. missing OSS CORS for localhost).
    }
  }

  if (added === 0) {
    throw new Error(
      'Could not download any artifacts. Check object storage CORS allows this site to read files.',
    );
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = suggestedFilename.endsWith('.zip')
    ? suggestedFilename
    : manifest.archive_filename || `${suggestedFilename.replace(/\.[^.]+$/, '')}.zip`;
  const objectUrl = URL.createObjectURL(blob);
  triggerBrowserDownload(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function downloadDocumentBundle(id: string, suggestedFilename: string): Promise<void> {
  try {
    await downloadDocumentBundleViaBrowser(id, suggestedFilename);
  } catch (error) {
    if (!isBrowserBundleFailure(error)) throw error;
    await downloadDocumentBundleViaServer(id, suggestedFilename);
  }
}

function triggerBrowserDownload(url: string, filename: string) {
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

export async function updateDocumentMetadata(
  id: string,
  metadata: Record<string, unknown>,
): Promise<{ metadata: Record<string, unknown> }> {
  const data = await authFetch(`/api/documents/${id}/metadata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });
  return { metadata: data.metadata as Record<string, unknown> };
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
