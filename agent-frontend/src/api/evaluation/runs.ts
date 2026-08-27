import { apiUrl } from '../base.ts';
import { getToken } from '../auth.ts';
import { formatApiError } from '../http.ts';
import { sha256HexFromFile } from '../../shared/file-hash.ts';
import { putFileToPresignedUrl } from '../direct-upload.ts';
import {
  deleteEvalDatasetItem,
  listEvalDatasetItems,
  uploadEvalDatasetItem,
  type EvalDatasetItem,
} from './datasets.ts';

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

export type EvalRunJudgeStatus = 'pending' | 'running' | 'done' | 'failed';

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
  file_count?: number;
  last_run_at?: string | null;
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
  attempt_id: string;
  variant_id: string;
  dataset_item_id: string;
  dataset_item_name?: string;
  stage: EvalRunItemStage;
  external_job_id: string | null;
  output_s3_prefix: string;
  transcript_s3_key: string | null;
  asr_result_s3_key: string | null;
  transcript_url: string | null;
  error_message: string | null;
  metrics: Record<string, unknown> | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
};

export type EvalRunCompareRow = {
  id: string;
  run_id: string;
  attempt_id: string;
  dataset_item_id: string;
  dataset_item_name: string;
  status: EvalRunCompareStatus;
  error_message: string | null;
  updated_at: string;
};

export type EvalRunJudgeRow = {
  id: string;
  run_id: string;
  attempt_id: string;
  dataset_item_id: string;
  dataset_item_name: string;
  scenario_id: string;
  status: EvalRunJudgeStatus;
  error_message: string | null;
  summary_metrics: Record<string, unknown> | null;
  result_url: string | null;
  updated_at: string;
};

export type EvalRunAttempt = {
  id: string;
  run_id: string;
  attempt_number: number;
  status: EvalRunStatus;
  phase: string;
  run_mode: EvalRunMode;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_run_items: number;
  completed_run_items: number;
  failed_run_items: number;
  total_compare_items: number;
  completed_compare_items: number;
  failed_compare_items: number;
  items: EvalRunItem[];
  comparisons: EvalRunCompareRow[];
  judge_jobs: EvalRunJudgeRow[];
};

export type EvalRunDatasetItemRef = {
  id: string;
  name: string;
  file_type: string;
  size_bytes?: number;
  reference_s3_key?: string | null;
  reference_url?: string | null;
};

export type EvalRunDetail = {
  run: EvalRun;
  variants: EvalRunVariant[];
  attempts: EvalRunAttempt[];
  items: EvalRunItem[];
  comparisons: EvalRunCompareRow[];
  judge_jobs: EvalRunJudgeRow[];
  dataset_items: EvalRunDatasetItemRef[];
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
      if (res.status === 404) {
        throw new Error(
          'Evaluate API not found (404). Restart the backend (`./scripts/dev.sh restart`) so new routes load.',
        );
      }
      throw new Error(`Unexpected server response (${res.status})`);
    }
  }
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

function isRunFilesRouteMissingError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('unexpected server response (404)') ||
    message.includes('http 404') ||
    message.includes('not found')
  );
}

function toRunFileRef(item: EvalDatasetItem): EvalRunDatasetItemRef {
  return {
    id: item.id,
    name: item.name,
    file_type: item.file_type,
    size_bytes: item.size_bytes,
  };
}

export function formatEvalRunStatus(status: EvalRunStatus): string {
  if (status === 'completed_with_errors') return 'Completed with errors';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatEvalRunPhase(phase: string): string {
  if (phase === 'transcribing') return 'Transcribing';
  if (phase === 'comparing') return 'Comparing';
  if (phase === 'judging') return 'Comparing';
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
  dataset_id?: string;
  name: string;
  description?: string;
  pipeline_config_ids: string[];
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

export async function updateEvalRun(
  runId: string,
  input: { name?: string; description?: string | null },
): Promise<EvalRun> {
  const data = await authFetch(`/api/evaluation/runs/${runId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data as EvalRun;
}

export async function listEvalRunFiles(
  runId: string,
  datasetId?: string,
): Promise<EvalRunDatasetItemRef[]> {
  try {
    const data = await authFetch(`/api/evaluation/runs/${runId}/files`);
    return (data.items as EvalRunDatasetItemRef[]) ?? [];
  } catch (err) {
    if (datasetId && isRunFilesRouteMissingError(err)) {
      const items = await listEvalDatasetItems(datasetId);
      return items.map(toRunFileRef);
    }
    throw err;
  }
}

type UploadInitResponse = {
  item_id: string;
  s3_key: string;
  file_hash: string;
  upload_url?: string;
  method?: string;
  headers?: Record<string, string>;
  skip_upload?: boolean;
};

export async function uploadEvalRunFile(
  runId: string,
  file: File,
  datasetId?: string,
): Promise<EvalRunDatasetItemRef> {
  try {
    const fileHash = await sha256HexFromFile(file);
    const init = (await authFetch(`/api/evaluation/runs/${runId}/files/upload-init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        file_hash: fileHash,
        size_bytes: file.size,
        content_type: file.type || undefined,
      }),
    })) as UploadInitResponse;

    if (!init.skip_upload) {
      const uploadUrl = init.upload_url;
      if (!uploadUrl) throw new Error('Server did not return an upload URL');
      await putFileToPresignedUrl(uploadUrl, file, init.headers ?? {}, init.method ?? 'PUT');
    }

    const completed = await authFetch(`/api/evaluation/runs/${runId}/files/upload-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: init.item_id,
        filename: file.name,
        file_hash: fileHash,
        s3_key: init.s3_key,
        size_bytes: file.size,
      }),
    });

    return completed as EvalRunDatasetItemRef;
  } catch (err) {
    if (datasetId && isRunFilesRouteMissingError(err)) {
      const item = await uploadEvalDatasetItem(datasetId, file);
      return toRunFileRef(item);
    }
    throw err;
  }
}

export async function deleteEvalRunFile(
  runId: string,
  itemId: string,
  datasetId?: string,
): Promise<void> {
  try {
    await authFetch(`/api/evaluation/runs/${runId}/files/${itemId}`, { method: 'DELETE' });
  } catch (err) {
    if (datasetId && isRunFilesRouteMissingError(err)) {
      await deleteEvalDatasetItem(datasetId, itemId);
      return;
    }
    throw err;
  }
}

export async function evaluateEvalRunAttempt(
  runId: string,
  attemptId: string,
): Promise<EvalRunDetail> {
  const data = await authFetch(`/api/evaluation/runs/${runId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attempt_id: attemptId }),
  });
  return data as EvalRunDetail;
}

export async function retryEvalRunJudge(
  runId: string,
  datasetItemId: string,
  attemptId?: string,
): Promise<EvalRunDetail> {
  const query = attemptId ? `?attempt_id=${encodeURIComponent(attemptId)}` : '';
  const data = await authFetch(`/api/evaluation/runs/${runId}/judge/${datasetItemId}/retry${query}`, {
    method: 'POST',
  });
  return data as EvalRunDetail;
}

export async function getEvalRunCompare(
  runId: string,
  datasetItemId: string,
  attemptId?: string,
): Promise<{ dataset_item_id: string; attempt_id: string; comparisons: EvalRunCompareEntry[] }> {
  const query = attemptId ? `?attempt_id=${encodeURIComponent(attemptId)}` : '';
  const data = await authFetch(`/api/evaluation/runs/${runId}/compare/${datasetItemId}${query}`);
  return data as { dataset_item_id: string; attempt_id: string; comparisons: EvalRunCompareEntry[] };
}
