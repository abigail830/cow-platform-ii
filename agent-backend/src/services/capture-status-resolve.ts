import type { AudioCaptureStatus } from '../db/index.ts';

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
): AudioCaptureStatus {
  const jobStage = captureJob?.stage ?? null;
  if (jobStage === 'done') return 'done';
  if (jobStage === 'failed') return 'failed';
  if (jobStage && POST_PROCESS_ACTIVE_STAGES.has(jobStage)) return 'post_processing';

  if (segments.length === 0) return 'draft';

  const states = segments.map(segmentAsrState);
  if (states.some((state) => state === 'failed')) return 'failed';
  if (states.some((state) => state === 'running')) return 'transcribing';
  if (states.every((state) => state === 'completed')) return 'ready';
  return 'draft';
}
