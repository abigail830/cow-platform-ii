export type CaptureReadiness = {
  ready: boolean;
  reason?: string;
  segmentCount: number;
  completedCount: number;
};

export function evaluateCaptureReadiness(input: {
  segmentStatuses: string[];
  latestJobStage?: string | null;
}): CaptureReadiness {
  const segmentCount = input.segmentStatuses.length;
  if (segmentCount === 0) {
    return { ready: false, reason: 'no_segments', segmentCount: 0, completedCount: 0 };
  }

  const completedCount = input.segmentStatuses.filter((status) => status === 'completed').length;
  if (completedCount !== segmentCount) {
    return {
      ready: false,
      reason: 'segments_incomplete',
      segmentCount,
      completedCount,
    };
  }

  const stage = input.latestJobStage ?? null;
  if (stage && !['failed', 'done'].includes(stage)) {
    return {
      ready: false,
      reason: 'post_process_active',
      segmentCount,
      completedCount,
    };
  }

  if (stage === 'done') {
    return {
      ready: false,
      reason: 'already_done',
      segmentCount,
      completedCount,
    };
  }

  return { ready: true, segmentCount, completedCount };
}
