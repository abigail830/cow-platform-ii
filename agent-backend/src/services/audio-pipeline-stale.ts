import type { AudioPipelineJobStage } from '../db/index.ts';
import { resolvePipelineWorkerMode } from './pipeline-worker-mode.ts';

const ACTIVE_AUDIO_JOB_STAGES = new Set<AudioPipelineJobStage>(['submitted', 'transcribing']);

export type StaleAudioJobInput = {
  stage: string;
  externalJobId: string | null | undefined;
  updatedAt: Date;
  createdAt: Date;
  now?: number;
  submitStaleMs?: number;
  transcribeStaleMs?: number;
};

export function defaultAudioSubmitStaleMs(env: NodeJS.ProcessEnv = process.env): number {
  if (resolvePipelineWorkerMode(env) === 'github_actions') {
    return Number(env.AUDIO_PIPELINE_GHA_SUBMIT_STALE_MS ?? 3 * 60 * 1000);
  }
  return Number(env.AUDIO_PIPELINE_SUBMIT_STALE_MS ?? 10 * 60 * 1000);
}

export function defaultAudioTranscribeStaleMs(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.AUDIO_PIPELINE_TRANSCRIBE_STALE_MS ?? 2 * 60 * 60 * 1000);
}

export function shouldFailStaleAudioJob(input: StaleAudioJobInput): { stale: boolean; message?: string } {
  const stage = input.stage as AudioPipelineJobStage;
  if (!ACTIVE_AUDIO_JOB_STAGES.has(stage)) {
    return { stale: false };
  }

  const now = input.now ?? Date.now();
  const submitStaleMs = input.submitStaleMs ?? defaultAudioSubmitStaleMs();
  const transcribeStaleMs = input.transcribeStaleMs ?? defaultAudioTranscribeStaleMs();
  const ageMs = now - input.updatedAt.getTime();

  if (stage === 'submitted' && !(input.externalJobId?.trim())) {
    const submitAgeMs = now - input.createdAt.getTime();
    if (submitAgeMs > submitStaleMs) {
      return {
        stale: true,
        message:
          'Audio transcription did not start (worker or provider submit timed out). ' +
          'Check GitHub Actions logs and model configuration.',
      };
    }
    return { stale: false };
  }

  if (stage === 'transcribing' && ageMs > transcribeStaleMs) {
    return {
      stale: true,
      message: 'Audio transcription timed out waiting for the cloud provider.',
    };
  }

  return { stale: false };
}
