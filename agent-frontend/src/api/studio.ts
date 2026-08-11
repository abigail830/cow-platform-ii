import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

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
  source?: 'platform' | 'studio';
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
