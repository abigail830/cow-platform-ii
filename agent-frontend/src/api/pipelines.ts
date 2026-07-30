import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type PipelineConfig = {
  id: string;
  name: string;
  description: string | null;
  pipelineName: string;
  commandTemplate: string;
  modelConfigId: string | null;
  modelConfigName: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PipelineConfigInput = {
  name: string;
  description?: string | null;
  pipelineName: string;
  commandTemplate: string;
  modelConfigId?: string | null;
  isEnabled?: boolean;
};

export type PipelineListResponse = {
  pipelines: PipelineConfig[];
  total: number;
  page: number;
  limit: number;
};

export const DEFAULT_PIPELINE_COMMAND_TEMPLATE =
  'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy markdown-headings';

export const DEFAULT_BAIDU_PIPELINE_COMMAND_TEMPLATE =
  'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy baidu-layouts';

export const DEFAULT_ALIYUN_PIPELINE_COMMAND_TEMPLATE =
  'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy aliyun-layouts';

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(path, {
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

export async function listPipelineConfigs(params?: {
  search?: string;
  enabledOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<PipelineListResponse> {
  const query = new URLSearchParams();
  if (params?.search?.trim()) query.set('search', params.search.trim());
  if (params?.enabledOnly) query.set('enabled_only', 'true');
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authFetch(`/api/admin/pipelines${suffix}`);
  return data as PipelineListResponse;
}

export async function createPipelineConfig(input: PipelineConfigInput): Promise<PipelineConfig> {
  const data = await authFetch('/api/admin/pipelines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.pipeline as PipelineConfig;
}

export async function updatePipelineConfig(
  id: string,
  input: Partial<PipelineConfigInput>,
): Promise<PipelineConfig> {
  const data = await authFetch(`/api/admin/pipelines/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.pipeline as PipelineConfig;
}

export async function deletePipelineConfig(id: string): Promise<void> {
  await authFetch(`/api/admin/pipelines/${id}`, { method: 'DELETE' });
}
