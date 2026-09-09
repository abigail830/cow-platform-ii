import type {
  AudioPipelineJobStage,
  CapturePipelineJobStage,
  PipelineJobStage,
} from '../../infrastructure/db/index.ts';

export type AsyncJobDomain =
  | 'document_pipeline'
  | 'audio_pipeline'
  | 'capture_pipeline'
  | 'kb_import';

export const DOCUMENT_PIPELINE_PROGRESS_STAGES: PipelineJobStage[] = [
  'submitted',
  'parsed',
  'extracted_metadata',
  'done',
];

export const AUDIO_PIPELINE_PROGRESS_STAGES: AudioPipelineJobStage[] = [
  'submitted',
  'transcribing',
  'done',
];

export const CAPTURE_PIPELINE_PROGRESS_STAGES: CapturePipelineJobStage[] = [
  'submitted',
  'structuring',
  'classifying',
  'extracting',
  'synthesizing',
  'materializing',
  'done',
];

export const KB_IMPORT_PROGRESS_STAGES = ['pending', 'running', 'completed'] as const;

const TERMINAL_STAGES = new Set(['done', 'failed', 'completed', 'cancelled']);

export function isTerminalAsyncJobStage(stage: string): boolean {
  return TERMINAL_STAGES.has(stage);
}

export function resumeStageForFailedJob(
  domain: AsyncJobDomain,
  failedFromStage: string | undefined,
): string | null {
  const stage = failedFromStage?.trim();
  if (!stage || stage === 'failed') return null;

  switch (domain) {
    case 'document_pipeline':
      if ((DOCUMENT_PIPELINE_PROGRESS_STAGES as readonly string[]).includes(stage)) return stage;
      return 'submitted';
    case 'audio_pipeline':
      if ((AUDIO_PIPELINE_PROGRESS_STAGES as readonly string[]).includes(stage)) return stage;
      return 'submitted';
    case 'capture_pipeline':
      if ((CAPTURE_PIPELINE_PROGRESS_STAGES as readonly string[]).includes(stage)) return stage;
      return 'structuring';
    case 'kb_import':
      if ((KB_IMPORT_PROGRESS_STAGES as readonly string[]).includes(stage)) return stage;
      return 'pending';
    default:
      return null;
  }
}

export function inferFailedFromStage(
  domain: AsyncJobDomain,
  previousStage: string | undefined,
  metrics: Record<string, unknown> | null | undefined,
): string | undefined {
  const fromMetrics = metrics?.failed_from_stage;
  if (typeof fromMetrics === 'string' && fromMetrics.trim()) return fromMetrics.trim();
  const prev = previousStage?.trim();
  if (prev && prev !== 'failed') return prev;
  switch (domain) {
    case 'document_pipeline':
      return 'submitted';
    case 'audio_pipeline':
      return 'transcribing';
    case 'capture_pipeline':
      return 'structuring';
    case 'kb_import':
      return 'running';
    default:
      return undefined;
  }
}
