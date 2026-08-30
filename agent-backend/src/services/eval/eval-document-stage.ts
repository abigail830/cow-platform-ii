import type { EvalRunItemStage } from '../../db/index.ts';
import type { PipelineJobStage } from '../../db/index.ts';

/** Map document pipeline job stage → eval run item stage (processing phase reuses transcribing). */
export function mapDocumentPipelineStageToEvalItemStage(
  stage: PipelineJobStage | string,
): EvalRunItemStage {
  if (stage === 'done') return 'done';
  if (stage === 'failed' || stage === 'cancelled') return 'failed';
  if (stage === 'parsed' || stage === 'extracted_metadata') return 'transcribing';
  return 'submitted';
}

export function isDocumentPipelineTerminalStage(stage: PipelineJobStage | string): boolean {
  return stage === 'done' || stage === 'failed' || stage === 'cancelled';
}
