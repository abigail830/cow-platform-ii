import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

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

export async function uploadSessionFile(
  agentName: string,
  instanceId: string,
  file: File,
): Promise<SessionFileUploadResult> {
  const body = new FormData();
  body.append('file', file);
  return (await authFetch(
    `/api/agents/${encodeURIComponent(agentName)}/${encodeURIComponent(instanceId)}/session-files`,
    { method: 'POST', body },
  )) as SessionFileUploadResult;
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
