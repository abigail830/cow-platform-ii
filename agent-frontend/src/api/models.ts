import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export const MODEL_API_TYPES = [
  'chat-completions',
  'embeddings',
  'custom-endpoint',
  'image-generation',
  'video-generation',
] as const;

export type ModelApiType = (typeof MODEL_API_TYPES)[number];

export const MODEL_API_TYPE_LABELS: Record<ModelApiType, string> = {
  'chat-completions': 'Chat completions',
  embeddings: 'Embeddings',
  'custom-endpoint': 'Custom endpoint',
  'image-generation': 'Image generation',
  'video-generation': 'Video generation',
};

export type ModelConfig = {
  id: string;
  name: string;
  modelId: string;
  provider: string;
  apiType: ModelApiType;
  capabilities: string[];
  baseUrl: string | null;
  hasApiKey: boolean;
  isDefault: boolean;
  extraConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ModelConfigInput = {
  name: string;
  modelId: string;
  provider: string;
  apiType: ModelApiType;
  capabilities: string[];
  baseUrl?: string | null;
  apiKey?: string | null;
  isDefault?: boolean;
  extraConfig?: Record<string, unknown>;
};

export type ModelListResponse = {
  models: ModelConfig[];
  total: number;
  page: number;
  limit: number;
};

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

export async function listModelConfigs(params?: {
  apiType?: ModelApiType | 'all';
  search?: string;
  page?: number;
  limit?: number;
}): Promise<ModelListResponse> {
  const query = new URLSearchParams();
  if (params?.apiType && params.apiType !== 'all') query.set('apiType', params.apiType);
  if (params?.search?.trim()) query.set('search', params.search.trim());
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authFetch(`/api/admin/models${suffix}`);
  return data as ModelListResponse;
}

export async function createModelConfig(input: ModelConfigInput): Promise<ModelConfig> {
  const data = await authFetch('/api/admin/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.model as ModelConfig;
}

export async function updateModelConfig(id: string, input: Partial<ModelConfigInput>): Promise<ModelConfig> {
  const data = await authFetch(`/api/admin/models/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.model as ModelConfig;
}

export async function setDefaultModelConfig(id: string): Promise<ModelConfig> {
  const data = await authFetch(`/api/admin/models/${id}/set-default`, { method: 'POST' });
  return data.model as ModelConfig;
}

export async function deleteModelConfig(id: string): Promise<void> {
  await authFetch(`/api/admin/models/${id}`, { method: 'DELETE' });
}
