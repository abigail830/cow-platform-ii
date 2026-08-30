import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { readApiErrorMessage } from './http.ts';

export type EvalJudgeDimensionScope = 'variant' | 'pairwise' | 'variant_vs_gt';
export type EvalJudgeDimensionKind =
  | 'geval_score'
  | 'geval_winner'
  | 'cer_score'
  | 'wer_score'
  | 'faithfulness_score'
  | 'contextual_recall_score'
  | 'contextual_precision_score';

export type EvalJudgeDimension = {
  id: string;
  label: string;
  scope: EvalJudgeDimensionScope;
  kind: EvalJudgeDimensionKind;
  weight: number;
  criteria: string;
  /** Optional GEval steps; omit to let DeepEval generate from criteria. */
  evaluation_steps?: string[];
  /** Pass expression evaluated against result score, e.g. >=7 or <0.3% */
  pass_threshold?: string;
};

export type EvalJudgeScenario = {
  id: string;
  scenario_key: string;
  label: string;
  description: string | null;
  requires_ground_truth: boolean;
  min_variants: number;
  dimensions: EvalJudgeDimension[];
  is_system: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const response = await fetch(apiUrl(path), {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(await readApiErrorMessage(response));
  if (response.status === 204) return null;
  return response.json();
}

export async function listJudgeScenarios(options?: {
  search?: string;
  enabledOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ scenarios: EvalJudgeScenario[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (options?.search) params.set('search', options.search);
  if (options?.enabledOnly) params.set('enabled_only', 'true');
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return authFetch(`/api/evaluation/judge-dimensions${suffix}`);
}

export async function getJudgeScenario(id: string): Promise<EvalJudgeScenario> {
  const data = await authFetch(`/api/evaluation/judge-dimensions/${id}`);
  return (data as { scenario: EvalJudgeScenario }).scenario;
}

export async function createJudgeScenario(input: {
  scenario_key: string;
  label: string;
  description?: string | null;
  requires_ground_truth?: boolean;
  min_variants?: number;
  dimensions: EvalJudgeDimension[];
  is_enabled?: boolean;
}): Promise<{ scenario: EvalJudgeScenario }> {
  return authFetch('/api/evaluation/judge-dimensions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateJudgeScenario(
  id: string,
  input: {
    label?: string;
    description?: string | null;
    requires_ground_truth?: boolean;
    min_variants?: number;
    dimensions?: EvalJudgeDimension[];
    is_enabled?: boolean;
  },
): Promise<{ scenario: EvalJudgeScenario }> {
  return authFetch(`/api/evaluation/judge-dimensions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteJudgeScenario(id: string): Promise<{ ok: true }> {
  return authFetch(`/api/evaluation/judge-dimensions/${id}`, { method: 'DELETE' });
}
