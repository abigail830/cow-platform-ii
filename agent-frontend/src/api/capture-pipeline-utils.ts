/** Shared ASR / segment pipeline status helpers (document capture segments). */

export type SegmentPipelineJob = {
  id: string;
  stage: string;
  pipeline_name: string;
  error_message: string | null;
  external_job_id: string | null;
  updated_at: string;
};

export type SegmentPipelineRecord = {
  id: string;
  status: string;
  pipeline_job: SegmentPipelineJob | null;
};

export function resolveEffectiveAudioStatus(
  segment: Pick<SegmentPipelineRecord, 'status' | 'pipeline_job'>,
): string {
  if (segment.pipeline_job?.stage === 'failed') return 'failed';
  if (segment.pipeline_job?.stage === 'done') return 'completed';
  return segment.status;
}

export function isAudioPipelineActive(
  segment: Pick<SegmentPipelineRecord, 'status' | 'pipeline_job'>,
): boolean {
  const status = resolveEffectiveAudioStatus(segment);
  if (status === 'running') return true;
  const stage = segment.pipeline_job?.stage;
  return stage === 'submitted' || stage === 'transcribing';
}

export function isAudioPipelineBusy(
  segment: Pick<SegmentPipelineRecord, 'id' | 'status' | 'pipeline_job'>,
  runningIds?: Set<string>,
): boolean {
  if (runningIds?.has(segment.id)) return true;
  return resolveEffectiveAudioStatus(segment) === 'running';
}

export const GENERIC_AUDIO_GHA_FAILURE_MESSAGE =
  'GitHub Actions worker failed before audio transcription completed';

export function displayAudioPipelineError(message: string | null | undefined): string | null {
  const trimmed = message?.trim();
  return trimmed ? trimmed : null;
}

export function formatAudioBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
