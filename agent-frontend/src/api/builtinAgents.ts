import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type BuiltinWorkflowKey =
  | 'session_image_extract'
  | 'metadata_extract'
  | 'faq_extract'
  | 'faq_polish';

export type BuiltinAgent = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  workflow_key: BuiltinWorkflowKey;
  api_type: string;
  model_config_id: string;
  model_name: string | null;
  system_prompt: string;
  user_prompt_template: string;
  output_mode: string;
  output_schema: Record<string, unknown> | null;
  temperature: string | null;
  max_tokens: number | null;
  is_system: boolean;
  version: number;
  variables: string[];
  created_at: string;
  updated_at: string;
};

export type WorkflowBinding = {
  workflow_key: BuiltinWorkflowKey;
  builtin_agent_def_id: string;
  enabled: boolean;
  agent_name: string;
  agent_slug: string;
};

export type BuiltinAgentUsageStats = {
  total_runs: number;
  days: number;
  trend: Array<{ date: string; count: number }>;
};

export type BuiltinAgentOption = {
  id: string;
  name: string;
  slug: string;
  workflow_key: BuiltinWorkflowKey;
  model_name: string | null;
};

const PLATFORM_DEFAULT = '';

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(formatApiError(response.status, await response.text()));
  return response;
}

export async function listBuiltinAgents(params?: {
  workflow?: BuiltinWorkflowKey;
  search?: string;
}): Promise<BuiltinAgent[]> {
  const query = new URLSearchParams();
  if (params?.workflow) query.set('workflow', params.workflow);
  if (params?.search?.trim()) query.set('search', params.search.trim());
  const suffix = query.size > 0 ? `?${query}` : '';
  const response = await authFetch(`/api/admin/builtin-agents${suffix}`);
  const data = (await response.json()) as { agents: BuiltinAgent[] };
  return data.agents;
}

export async function listBuiltinAgentOptions(
  workflow: BuiltinWorkflowKey,
): Promise<BuiltinAgentOption[]> {
  const response = await authFetch(`/api/builtin-agents/options?workflow=${workflow}`);
  const data = (await response.json()) as { agents: BuiltinAgentOption[] };
  return data.agents;
}

export async function getBuiltinAgentsStats(days?: number): Promise<BuiltinAgentUsageStats> {
  const query = days ? `?days=${days}` : '';
  const response = await authFetch(`/api/admin/builtin-agents/stats${query}`);
  const data = (await response.json()) as { stats: BuiltinAgentUsageStats };
  return data.stats;
}

export async function getBuiltinAgentStats(
  id: string,
  days?: number,
): Promise<BuiltinAgentUsageStats> {
  const query = days ? `?days=${days}` : '';
  const response = await authFetch(`/api/admin/builtin-agents/${id}/stats${query}`);
  const data = (await response.json()) as { stats: BuiltinAgentUsageStats };
  return data.stats;
}

export async function getBuiltinAgent(id: string): Promise<BuiltinAgent> {
  const response = await authFetch(`/api/admin/builtin-agents/${id}`);
  const data = (await response.json()) as { agent: BuiltinAgent };
  return data.agent;
}

export async function listWorkflowBindings(): Promise<WorkflowBinding[]> {
  const response = await authFetch('/api/admin/builtin-agents/bindings');
  const data = (await response.json()) as { bindings: WorkflowBinding[] };
  return data.bindings;
}

export async function createBuiltinAgent(input: {
  slug: string;
  name: string;
  description?: string | null;
  workflow_key: BuiltinWorkflowKey;
  api_type?: string;
  model_config_id: string;
  system_prompt?: string;
  user_prompt_template?: string;
  output_mode?: string;
  output_schema?: Record<string, unknown> | null;
  temperature?: string | null;
  max_tokens?: number | null;
}): Promise<BuiltinAgent> {
  const response = await authFetch('/api/admin/builtin-agents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as { agent: BuiltinAgent };
  return data.agent;
}

export async function updateBuiltinAgent(
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    model_config_id: string;
    system_prompt: string;
    user_prompt_template: string;
    output_mode: string;
    output_schema: Record<string, unknown> | null;
    temperature: string | null;
    max_tokens: number | null;
  }>,
): Promise<BuiltinAgent> {
  const response = await authFetch(`/api/admin/builtin-agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as { agent: BuiltinAgent };
  return data.agent;
}

export async function deleteBuiltinAgent(id: string): Promise<void> {
  await authFetch(`/api/admin/builtin-agents/${id}`, { method: 'DELETE' });
}

export async function updateWorkflowBinding(
  workflowKey: BuiltinWorkflowKey,
  builtinAgentDefId: string,
): Promise<void> {
  await authFetch(`/api/admin/builtin-agents/bindings/${workflowKey}`, {
    method: 'PUT',
    body: JSON.stringify({ builtin_agent_def_id: builtinAgentDefId }),
  });
}

export async function testBuiltinAgent(
  id: string,
  input: {
    variables?: Record<string, string>;
    image_base64?: string;
    image_mime_type?: string;
    draft?: Partial<{
      model_config_id: string;
      system_prompt: string;
      user_prompt_template: string;
      output_mode: string;
      temperature: string | null;
      max_tokens: number | null;
    }>;
  },
): Promise<{
  run_id: string;
  raw_text: string;
  parsed: unknown;
  latency_ms: number;
  model_config_id?: string;
  model_name?: string;
}> {
  const response = await authFetch(`/api/admin/builtin-agents/${id}/test-run`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return (await response.json()) as {
    run_id: string;
    raw_text: string;
    parsed: unknown;
    latency_ms: number;
    model_config_id?: string;
    model_name?: string;
  };
}

export { PLATFORM_DEFAULT as BUILTIN_AGENT_PLATFORM_DEFAULT };
