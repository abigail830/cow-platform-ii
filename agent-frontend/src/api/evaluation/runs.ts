import { apiUrl } from '../base.ts';
import { getToken } from '../auth.ts';
import { formatApiError } from '../http.ts';

export type EvalRunStatus =
  | 'draft'
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

export type EvalRunItemStage = 'submitted' | 'transcribing' | 'done' | 'failed' | 'cancelled';

export type EvalRunMode = 'pipeline_only' | 'full';

export type EvalRunCompareStatus = 'pending' | 'running' | 'done' | 'failed';

export type EvalRun = {
  id: string;
  dataset_id: string;
  name: string;
  description: string | null;
  status: EvalRunStatus;
  phase: string;
  run_mode: EvalRunMode;
  eval_type: string;
  judge_enabled: boolean;
  total_run_items: number;
  completed_run_items: number;
  failed_run_items: number;
  total_compare_items: number;
  completed_compare_items: number;
  failed_compare_items: number;
  summary_metrics: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EvalRunVariant = {
  id: string;
  run_id: string;
  pipeline_config_id: string;
  pipeline_name: string;
  display_name: string;
  status: string;
};

export type EvalRunItem = {
  id: string;
  run_id: string;
  variant_id: string;
  dataset_item_id: string;
  dataset_item_name?: string;
  stage: EvalRunItemStage;
  external_job_id: string | null;
  output_s3_prefix: string;
  transcript_s3_key: string | null;
  asr_result_s3_key: string | null;
  error_message: string | null;
  metrics: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type EvalRunCompareRow = {
  id: string;
  run_id: string;
  dataset_item_id: string;
  dataset_item_name: string;
  status: EvalRunCompareStatus;
  error_message: string | null;
  updated_at: string;
};

export type EvalRunDetail = {
  run: EvalRun;
  variants: EvalRunVariant[];
  items: EvalRunItem[];
  comparisons: EvalRunCompareRow[];
};

export type EvalRunProcessingOption = {
  id: string;
  name: string;
  pipeline_name: string;
};

export type EvalRunCompareEntry = {
  variant_id: string;
  pipeline_name: string;
  display_name: string;
  stage: EvalRunItemStage;
  transcript_url: string | null;
  error_message: string | null;
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

export function formatEvalRunStatus(status: EvalRunStatus): string {
  if (status === 'completed_with_errors') return 'Completed with errors';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatEvalRunPhase(phase: string): string {
  if (phase === 'transcribing') return 'Transcribing';
  if (phase === 'comparing') return 'Comparing';
  if (phase === 'judging') return 'Judging';
  if (phase === 'done') return 'Done';
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export async function listEvalRunProcessingOptions(): Promise<{
  transcription_pipelines: EvalRunProcessingOption[];
}> {
  const data = await authFetch('/api/evaluation/runs/options');
  return {
    transcription_pipelines: (data.transcription_pipelines as EvalRunProcessingOption[]) ?? [],
  };
}

export async function listEvalRuns(): Promise<EvalRun[]> {
  const data = await authFetch('/api/evaluation/runs');
  return (data.runs as EvalRun[]) ?? [];
}

export async function createEvalRun(input: {
  dataset_id: string;
  name: string;
  description?: string;
  pipeline_config_ids: string[];
  run_mode?: EvalRunMode;
}): Promise<{ run: EvalRun; variants: EvalRunVariant[] }> {
  const data = await authFetch('/api/evaluation/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data as { run: EvalRun; variants: EvalRunVariant[] };
}

export async function getEvalRunDetail(runId: string): Promise<EvalRunDetail> {
  const data = await authFetch(`/api/evaluation/runs/${runId}`);
  return data as EvalRunDetail;
}

export async function startEvalRun(
  runId: string,
  options?: { run_mode?: EvalRunMode },
): Promise<EvalRunDetail> {
  const data = await authFetch(`/api/evaluation/runs/${runId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options?.run_mode ? { run_mode: options.run_mode } : {}),
  });
  return data as EvalRunDetail;
}

export async function deleteEvalRun(runId: string): Promise<void> {
  await authFetch(`/api/evaluation/runs/${runId}`, { method: 'DELETE' });
}

export async function getEvalRunCompare(
  runId: string,
  datasetItemId: string,
): Promise<{ dataset_item_id: string; comparisons: EvalRunCompareEntry[] }> {
  const data = await authFetch(`/api/evaluation/runs/${runId}/compare/${datasetItemId}`);
  return data as { dataset_item_id: string; comparisons: EvalRunCompareEntry[] };
}
