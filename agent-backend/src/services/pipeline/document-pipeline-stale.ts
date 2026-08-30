import type { PipelineJobStage, PipelineProvider } from '../../db/index.ts';
import { resolvePipelineWorkerMode } from './pipeline-worker-mode.ts';

const ACTIVE_DOCUMENT_JOB_STAGES = new Set<PipelineJobStage>([
  'submitted',
  'parsed',
  'extracted_metadata',
]);

export type StaleDocumentPipelineJobInput = {
  stage: string;
  provider: PipelineProvider | string | null | undefined;
  externalJobId: string | null | undefined;
  updatedAt: Date;
  createdAt: Date;
  now?: number;
  submitStaleMs?: number;
  parsedStaleMs?: number;
};

export function defaultDocumentSubmitStaleMs(env: NodeJS.ProcessEnv = process.env): number {
  if (resolvePipelineWorkerMode(env) === 'github_actions') {
    return Number(env.PIPELINE_GHA_SUBMIT_STALE_MS ?? 20 * 60 * 1000);
  }
  return Number(env.PIPELINE_SUBMIT_STALE_MS ?? 15 * 60 * 1000);
}

export function defaultDocumentParsedStaleMs(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.PIPELINE_PARSED_STALE_MS ?? 5 * 60 * 1000);
}

export function shouldFailStaleDocumentPipelineJob(
  input: StaleDocumentPipelineJobInput,
): { stale: boolean; message?: string } {
  const stage = input.stage as PipelineJobStage;
  if (!ACTIVE_DOCUMENT_JOB_STAGES.has(stage)) {
    return { stale: false };
  }

  const now = input.now ?? Date.now();
  const submitStaleMs = input.submitStaleMs ?? defaultDocumentSubmitStaleMs();
  const parsedStaleMs = input.parsedStaleMs ?? defaultDocumentParsedStaleMs();
  const updatedAgeMs = now - input.updatedAt.getTime();
  const createdAgeMs = now - input.createdAt.getTime();
  const provider = String(input.provider ?? '');

  if (stage === 'submitted') {
    const isCloudProvider = provider === 'baidu' || provider === 'aliyun';
    if (isCloudProvider && !(input.externalJobId?.trim())) {
      if (createdAgeMs > submitStaleMs) {
        return {
          stale: true,
          message:
            'Document parse did not start (worker or provider submit timed out). ' +
            'Check GitHub Actions logs and cloud credentials.',
        };
      }
      return { stale: false };
    }

    if (updatedAgeMs > submitStaleMs) {
      return {
        stale: true,
        message:
          'Document parse worker exited without completing (check GitHub Actions logs).',
      };
    }
    return { stale: false };
  }

  if ((stage === 'parsed' || stage === 'extracted_metadata') && updatedAgeMs > parsedStaleMs) {
    return {
      stale: true,
      message:
        'Document parse metadata step did not finish (worker may have failed mid-run). ' +
        'Check GitHub Actions logs.',
    };
  }

  return { stale: false };
}
