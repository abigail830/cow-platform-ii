import type { EvalRunItemStage } from '../../db/index.ts';
import { computeRtfFromMs } from '../../shared/eval/eval-audio-duration.ts';
import { getStorageReadUrl } from '../../storage/document-files.ts';

type EvalRunItemRow = {
  id: string;
  runId: string;
  attemptId: string;
  variantId: string;
  datasetItemId: string;
  stage: EvalRunItemStage;
  externalJobId: string | null;
  outputS3Prefix: string;
  transcriptS3Key: string | null;
  asrResultS3Key: string | null;
  errorMessage: string | null;
  metrics: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export function evalItemAudioDurationSec(
  metrics: Record<string, unknown> | null | undefined,
): number | null {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  const raw = metrics.audio_duration_sec;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

export function evalItemDurationMs(item: {
  stage: string;
  metrics: Record<string, unknown> | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}): number | null {
  const metrics = item.metrics;
  if (metrics && typeof metrics === 'object') {
    if (typeof metrics.asr_duration_ms === 'number') return metrics.asr_duration_ms;
    if (typeof metrics.worker_duration_ms === 'number') return metrics.worker_duration_ms;
  }
  if (item.stage === 'done' || item.stage === 'failed' || item.stage === 'cancelled') {
    const ms = item.updatedAt.getTime() - item.createdAt.getTime();
    return ms >= 0 ? ms : null;
  }
  return null;
}

export function evalItemRtf(item: {
  stage: string;
  metrics: Record<string, unknown> | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}): number | null {
  const metrics = item.metrics;
  if (metrics && typeof metrics === 'object') {
    const stored = metrics.rtf_asr;
    if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  }
  const audioSec = evalItemAudioDurationSec(metrics);
  const durationMs = evalItemDurationMs(item);
  if (audioSec == null || durationMs == null) return null;
  return computeRtfFromMs(durationMs, audioSec);
}

export async function enrichEvalRunItemPublic(
  item: EvalRunItemRow,
  datasetItemName: string,
) {
  const durationMs = evalItemDurationMs(item);
  const audioDurationSec = evalItemAudioDurationSec(item.metrics);
  const rtf = evalItemRtf(item);
  let transcriptUrl: string | null = null;
  if (item.stage === 'done' && item.transcriptS3Key) {
    transcriptUrl = await getStorageReadUrl(item.transcriptS3Key, 3600);
  }

  return {
    id: item.id,
    run_id: item.runId,
    attempt_id: item.attemptId,
    variant_id: item.variantId,
    dataset_item_id: item.datasetItemId,
    dataset_item_name: datasetItemName,
    stage: item.stage,
    external_job_id: item.externalJobId,
    output_s3_prefix: item.outputS3Prefix,
    transcript_s3_key: item.transcriptS3Key,
    asr_result_s3_key: item.asrResultS3Key,
    transcript_url: transcriptUrl,
    error_message: item.errorMessage,
    metrics: item.metrics,
    duration_ms: durationMs,
    audio_duration_sec: audioDurationSec,
    rtf,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}
