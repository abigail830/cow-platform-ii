import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';
import { putFileToPresignedUrl, shouldUseDirectUpload } from './direct-upload.ts';

export type SessionFileListItem = {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hasContentCache: boolean;
  createdAt: string;
};

export type SessionFileUploadResult = {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hasContentCache: boolean;
  createdAt: string;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function listSessionFiles(
  agentName: string,
  instanceId: string,
): Promise<SessionFileListItem[]> {
  const data = await authFetch(
    `/api/agents/${encodeURIComponent(agentName)}/${encodeURIComponent(instanceId)}/session-files`,
  );
  return (data.files as SessionFileListItem[]) ?? [];
}

function sessionFilesBasePath(agentName: string, instanceId: string): string {
  return `/api/agents/${encodeURIComponent(agentName)}/${encodeURIComponent(instanceId)}/session-files`;
}

async function uploadSessionFileMultipart(
  agentName: string,
  instanceId: string,
  file: File,
): Promise<SessionFileUploadResult> {
  const body = new FormData();
  body.append('file', file);
  return (await authFetch(sessionFilesBasePath(agentName, instanceId), {
    method: 'POST',
    body,
  })) as SessionFileUploadResult;
}

async function uploadSessionFileDirect(
  agentName: string,
  instanceId: string,
  file: File,
): Promise<SessionFileUploadResult> {
  const init = (await authFetch(`${sessionFilesBasePath(agentName, instanceId)}/upload-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      size_bytes: file.size,
    }),
  })) as {
    storage_backend?: string;
    use_multipart?: boolean;
    file_id?: string;
    pathname?: string;
    upload_url?: string;
    method?: string;
    headers?: Record<string, string>;
  };

  if (init.storage_backend === 'local' || init.use_multipart) {
    return uploadSessionFileMultipart(agentName, instanceId, file);
  }

  const fileId = init.file_id;
  const pathname = init.pathname;
  const uploadUrl = init.upload_url;
  if (!fileId || !pathname || !uploadUrl) {
    throw new Error('Server did not return blob upload credentials');
  }

  await putFileToPresignedUrl(uploadUrl, file, init.headers ?? {}, init.method ?? 'PUT');

  return (await authFetch(`${sessionFilesBasePath(agentName, instanceId)}/upload-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      filename: file.name,
      pathname,
      size_bytes: file.size,
    }),
  })) as SessionFileUploadResult;
}

export async function uploadSessionFile(
  agentName: string,
  instanceId: string,
  file: File,
): Promise<SessionFileUploadResult> {
  if (shouldUseDirectUpload(file)) {
    return uploadSessionFileDirect(agentName, instanceId, file);
  }
  return uploadSessionFileMultipart(agentName, instanceId, file);
}

export async function deleteSessionFile(
  agentName: string,
  instanceId: string,
  fileId: string,
): Promise<void> {
  await authFetch(
    `/api/agents/${encodeURIComponent(agentName)}/${encodeURIComponent(instanceId)}/session-files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  );
}
