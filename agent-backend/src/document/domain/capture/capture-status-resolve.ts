import type { AudioCaptureStatus } from '../../../infrastructure/db/index.ts';

export type SegmentAsrState = 'pending' | 'running' | 'completed' | 'failed';

export type CaptureStatusSegment = {
  status: string;
  pipeline_job?: { stage: string } | null;
};

const POST_PROCESS_ACTIVE_STAGES = new Set([
  'submitted',
  'structuring',
  'classifying',
  'extracting',
  'synthesizing',
]);

export function segmentAsrState(segment: CaptureStatusSegment): SegmentAsrState {
  const jobStage = segment.pipeline_job?.stage;
  if (jobStage === 'failed' || segment.status === 'failed') return 'failed';
  if (jobStage === 'done' || segment.status === 'completed') return 'completed';
  if (jobStage === 'submitted' || jobStage === 'transcribing' || segment.status === 'running') {
    return 'running';
  }
  return 'pending';
}

export function resolveCaptureStatusFromSegments(
  segments: CaptureStatusSegment[],
  captureJob?: { stage: string } | null,
  inputMode?: 'document' | 'audio' | 'transcript',
): AudioCaptureStatus {
  const usePostProcessJob = inputMode !== 'document';
  const jobStage = usePostProcessJob ? (captureJob?.stage ?? null) : null;
  if (jobStage === 'done') return 'done';
  if (jobStage === 'failed') return 'failed';
  if (jobStage && POST_PROCESS_ACTIVE_STAGES.has(jobStage)) return 'post_processing';

  if (segments.length === 0) return 'draft';

  const states = segments.map(segmentAsrState);
  if (states.some((state) => state === 'failed')) return 'failed';
  if (states.some((state) => state === 'running')) {
    return inputMode === 'document' ? 'running' : 'transcribing';
  }
  if (states.every((state) => state === 'completed')) {
    return inputMode === 'document' ? 'done' : 'ready';
  }
  return 'draft';
}
