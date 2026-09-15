import type { CapturePipelineJobStage } from '../../../infrastructure/db/index.ts';
import { resolvePipelineWorkerMode } from '../../../pipeline/application/pipeline-worker-mode.ts';

const ACTIVE_CAPTURE_JOB_STAGES = new Set<CapturePipelineJobStage>([
  'submitted',
  'structuring',
  'classifying',
  'extracting',
  'synthesizing',
  'materializing',
]);

export type StaleCapturePipelineJobInput = {
  stage: string;
  createdAt: Date;
  updatedAt: Date;
  now?: number;
  submitStaleMs?: number;
  inFlightStaleMs?: number;
};

/** GHA dispatch + checkout/setup can take several minutes before the first PATCH. */
export function defaultCaptureSubmitStaleMs(env: NodeJS.ProcessEnv = process.env): number {
  if (resolvePipelineWorkerMode(env) === 'github_actions') {
    return Number(env.CAPTURE_PIPELINE_GHA_SUBMIT_STALE_MS ?? 10 * 60 * 1000);
  }
  return Number(env.CAPTURE_PIPELINE_SUBMIT_STALE_MS ?? 10 * 60 * 1000);
}

/** Workflow timeout is 45 minutes; allow a short buffer after the last PATCH. */
export function defaultCaptureInFlightStaleMs(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.CAPTURE_PIPELINE_IN_FLIGHT_STALE_MS ?? 60 * 60 * 1000);
}

export function shouldFailStaleCapturePipelineJob(
  input: StaleCapturePipelineJobInput,
): { stale: boolean; message?: string } {
  const stage = input.stage as CapturePipelineJobStage;
  if (!ACTIVE_CAPTURE_JOB_STAGES.has(stage)) {
    return { stale: false };
  }

  const now = input.now ?? Date.now();
  const submitStaleMs = input.submitStaleMs ?? defaultCaptureSubmitStaleMs();
  const inFlightStaleMs = input.inFlightStaleMs ?? defaultCaptureInFlightStaleMs();

  if (stage === 'submitted') {
    const submitAgeMs = now - input.createdAt.getTime();
    if (submitAgeMs > submitStaleMs) {
      return {
        stale: true,
        message:
          'Capture post-process did not start (worker dispatch timed out). ' +
          'Check GitHub Actions logs and retry Run post-process.',
      };
    }
    return { stale: false };
  }

  const updatedAgeMs = now - input.updatedAt.getTime();
  if (updatedAgeMs > inFlightStaleMs) {
    return {
      stale: true,
      message:
        'Capture post-process timed out waiting for the worker. ' +
        'Check GitHub Actions logs and retry Run post-process.',
    };
  }

  return { stale: false };
}
