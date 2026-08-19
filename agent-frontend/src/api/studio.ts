import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';
import { putFileToPresignedUrl, shouldUseDirectUpload } from './direct-upload.ts';

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        res.ok
          ? `Invalid JSON from ${path}`
          : `HTTP ${res.status}: ${text.slice(0, 120).trim() || res.statusText}`,
      );
    }
  }
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export type AssetSummary = {
  id: string;
  title: string;
  description: string;
  type: 'agent' | 'skill' | 'mcp' | 'sandbox';
  source?: 'platform' | 'studio' | 'user';
  origin?: 'platform' | 'user';
  canManage?: boolean;
  icon?: string;
};

export type StudioAgent = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  icon?: string | null;
  origin: string;
  instructions?: string;
  modelConfigId?: string;
  skillIds?: string[];
  platformMcpIds?: string[];
  privateMcpIds?: string[];
  datasourceIds?: string[];
  sandbox?: Record<string, unknown>;
  a2a?: Record<string, unknown> | null;
};

export type UserDatasource = {
  id: string;
  name: string;
  displayTitle: string | null;
  type: 'postgres' | 'mysql';
  host: string;
  port: number;
  username: string;
  database: string;
  ssl: boolean;
  readonly: boolean;
  maxRows: number;
  statementTimeoutMs: number;
  updatedAt: string;
};

export type CreateDatasourceInput = {
  name: string;
  displayTitle?: string;
  type: 'postgres' | 'mysql';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
  readonly?: boolean;
  maxRows?: number;
  statementTimeoutMs?: number;
};

export async function listStudioAssets(type?: string): Promise<AssetSummary[]> {
  const q = type ? `?type=${encodeURIComponent(type)}` : '';
  const data = await authFetch(`/api/studio/assets${q}`);
  return (data.assets ?? []) as AssetSummary[];
}

export type SkillTreeNode = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: SkillTreeNode[];
};

export async function getSkillTree(skillId: string): Promise<{
  skillId: string;
  tree: SkillTreeNode[];
  defaultPath: string | null;
}> {
  const data = await authFetch(`/api/studio/assets/skills/${encodeURIComponent(skillId)}/tree`);
  return {
    skillId: data.skillId as string,
    tree: (data.tree ?? []) as SkillTreeNode[],
    defaultPath: (data.defaultPath as string | null) ?? null,
  };
}

export async function getSkillFile(
  skillId: string,
  path: string,
): Promise<{ path: string; content: string; truncated: boolean }> {
  const data = await authFetch(
    `/api/studio/assets/skills/${encodeURIComponent(skillId)}/file?path=${encodeURIComponent(path)}`,
  );
  return data as { path: string; content: string; truncated: boolean };
}

async function sha256HexFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadSkillZip(file: File): Promise<{ id: string; slug: string; import_status: string }> {
  if (shouldUseDirectUpload(file)) {
    const fileHash = await sha256HexFromFile(file);
    const init = (await authFetch('/api/studio/skills/upload-init', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        file_hash: fileHash,
        size_bytes: file.size,
      }),
    })) as {
      s3_key: string;
      upload_url?: string;
      method?: string;
      headers?: Record<string, string>;
    };

    if (!init.upload_url) throw new Error('Server did not return an upload URL');
    await putFileToPresignedUrl(
      init.upload_url,
      file,
      init.headers ?? { 'Content-Type': 'application/zip' },
      init.method ?? 'PUT',
    );

    const data = await authFetch('/api/studio/skills/upload-complete', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        file_hash: fileHash,
        s3_key: init.s3_key,
        size_bytes: file.size,
      }),
    });
    return data as { id: string; slug: string; import_status: string };
  }

  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(apiUrl('/api/studio/skills/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) data = JSON.parse(text) as Record<string, unknown>;
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data as { id: string; slug: string; import_status: string };
}

export async function deleteSkill(skillId: string): Promise<void> {
  await authFetch(`/api/studio/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' });
}

export async function getPlatformMcpDetail(id: string): Promise<{
  id: string;
  title: string;
  description: string;
  config: { mcpServers: Record<string, unknown> };
  tools: {
    status: 'ok' | 'needs_key' | 'error';
    tools: Array<{ name: string; description?: string }>;
    error?: string;
  };
}> {
  const data = await authFetch(`/api/studio/assets/mcp/${encodeURIComponent(id)}`);
  return data.mcp as {
    id: string;
    title: string;
    description: string;
    config: { mcpServers: Record<string, unknown> };
    tools: {
      status: 'ok' | 'needs_key' | 'error';
      tools: Array<{ name: string; description?: string }>;
      error?: string;
    };
  };
}

/** @deprecated use getPlatformMcpDetail */
export async function getPlatformMcpConfig(id: string): Promise<Record<string, unknown>> {
  const detail = await getPlatformMcpDetail(id);
  return detail.config;
}

export async function listStudioAgents(): Promise<StudioAgent[]> {
  const data = await authFetch('/api/studio/agents');
  return (data.agents ?? []) as StudioAgent[];
}

export async function getStudioAgent(id: string): Promise<StudioAgent> {
  const data = await authFetch(`/api/studio/agents/${id}`);
  return data.agent as StudioAgent;
}

export type StudioAgentDraft = {
  slug: string;
  displayName: string;
  description: string;
  instructions?: string;
  modelConfigId?: string | null;
  skillIds?: string[];
  platformMcpIds?: string[];
  datasourceIds?: string[];
  sandbox?: Record<string, unknown>;
};

/** Read-only view of a platform (system) agent for Asset Market. */
export type PlatformAgentDetail = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  instructions: string;
  modelConfigId: string | null;
  modelConfigName: string | null;
  skillIds: string[];
  platformMcpIds: string[];
  datasourceNames: string[];
  sandbox: Record<string, unknown>;
  source: 'platform';
};

export async function getPlatformAgentDetail(id: string): Promise<PlatformAgentDetail> {
  const data = await authFetch(`/api/studio/assets/agents/${encodeURIComponent(id)}`);
  return data.agent as PlatformAgentDetail;
}

export async function getPlatformAgentCopyDraft(id: string): Promise<StudioAgentDraft> {
  const data = await authFetch(`/api/studio/assets/agents/${encodeURIComponent(id)}/copy-draft`);
  return data.draft as StudioAgentDraft;
}

export async function createStudioAgent(body: Record<string, unknown>): Promise<StudioAgent> {
  const data = await authFetch('/api/studio/agents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.agent as StudioAgent;
}

export async function updateStudioAgent(
  id: string,
  body: Record<string, unknown>,
): Promise<StudioAgent> {
  const data = await authFetch(`/api/studio/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return data.agent as StudioAgent;
}

export async function deleteStudioAgent(id: string): Promise<void> {
  await authFetch(`/api/studio/agents/${id}`, { method: 'DELETE' });
}

export async function warmAgent(name: string): Promise<void> {
  await authFetch(`/api/studio/agents/${encodeURIComponent(name)}/warm`, { method: 'POST' });
}

export async function putPlatformMcpCredential(platformMcpId: string, apiKey: string): Promise<void> {
  await authFetch(`/api/studio/mcp-credentials/${encodeURIComponent(platformMcpId)}`, {
    method: 'PUT',
    body: JSON.stringify({ apiKey }),
  });
}

export async function listUserDatasources(): Promise<UserDatasource[]> {
  const data = await authFetch('/api/studio/datasources');
  return (data.datasources ?? []) as UserDatasource[];
}

export async function createUserDatasource(body: CreateDatasourceInput): Promise<UserDatasource> {
  const data = await authFetch('/api/studio/datasources', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.datasource as UserDatasource;
}

export async function deleteUserDatasource(id: string): Promise<void> {
  await authFetch(`/api/studio/datasources/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Platform MCP templates that use datasource instances instead of API keys. */
export const DATASOURCE_MCP_TEMPLATE_IDS = new Set(['postgres', 'mysql']);
