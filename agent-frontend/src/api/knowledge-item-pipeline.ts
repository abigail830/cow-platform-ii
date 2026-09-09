import type { ChannelKnowledgeItem } from './documents.ts';
import { isCapturePipelineActive } from './documentCaptures.ts';

export type KnowledgeItemRunAction = 'segment' | 'post-process';

const POST_PROCESS_ACTIVE_STAGES = new Set([
  'submitted',
  'structuring',
  'classifying',
  'extracting',
  'synthesizing',
  'materializing',
]);

const ACTIVE_SEGMENT_JOB_STAGES = new Set([
  'submitted',
  'parsed',
  'extracted_metadata',
  'transcribing',
]);

/** Document captures only use segment-level document parse — never post-process. */
export function captureUsesPostProcess(item: Pick<ChannelKnowledgeItem, 'input_mode'>): boolean {
  return item.input_mode === 'audio' || item.input_mode === 'transcript';
}

export function knowledgeItemUsesSegmentPipeline(
  item: Pick<ChannelKnowledgeItem, 'input_mode' | 'primary_segment_id'>,
): boolean {
  return item.input_mode !== 'transcript' && Boolean(item.primary_segment_id);
}

export function knowledgeItemSegmentDocumentStatus(item: ChannelKnowledgeItem): string {
  const jobStage = item.segment_pipeline_job?.stage;
  if (jobStage === 'failed' || item.segment_status === 'failed') return 'failed';
  if (item.segment_status === 'running' || (jobStage && ACTIVE_SEGMENT_JOB_STAGES.has(jobStage))) {
    return 'running';
  }
  if (jobStage === 'done' || item.segment_status === 'completed') return 'completed';
  return item.segment_status ?? 'uploaded';
}

export function shouldShowKnowledgeSegmentPipeline(item: ChannelKnowledgeItem): boolean {
  if (item.input_mode === 'document') {
    return knowledgeItemUsesSegmentPipeline(item);
  }
  if (item.input_mode === 'transcript') return false;
  if (!item.primary_segment_id) return false;
  const jobStage = item.segment_pipeline_job?.stage;
  if (item.segment_status === 'running' || item.segment_status === 'failed') return true;
  if (jobStage && jobStage !== 'done') return true;
  return item.segment_status !== 'completed';
}

export function shouldShowKnowledgePostProcessPipeline(item: ChannelKnowledgeItem): boolean {
  if (!captureUsesPostProcess(item)) return false;
  if (item.status === 'post_processing') return true;
  const job = item.pipeline_job;
  if (!job) return false;
  if (job.stage === 'failed') return true;
  return POST_PROCESS_ACTIVE_STAGES.has(job.stage);
}

export function isKnowledgeItemPipelineActive(item: ChannelKnowledgeItem): boolean {
  if (captureUsesPostProcess(item)) {
    if (isCapturePipelineActive({ status: item.status, pipeline_job: item.pipeline_job })) return true;
  }
  if (item.segment_status === 'running') return true;
  const segStage = item.segment_pipeline_job?.stage;
  return segStage != null && ACTIVE_SEGMENT_JOB_STAGES.has(segStage);
}

/** Pipeline action for the row Run control (shown even while busy). */
export function resolveKnowledgeItemRunTarget(item: ChannelKnowledgeItem): KnowledgeItemRunAction | null {
  if (item.input_mode === 'document') {
    return item.primary_segment_id ? 'segment' : null;
  }

  if (item.input_mode === 'transcript') {
    if (item.status === 'ready' || item.status === 'done' || item.status === 'failed') {
      return 'post-process';
    }
    return null;
  }

  const segmentFailed =
    item.segment_status === 'failed' || item.segment_pipeline_job?.stage === 'failed';
  const segmentIncomplete =
    item.segment_status != null &&
    item.segment_status !== 'completed' &&
    item.segment_status !== 'running';
  if (item.primary_segment_id && (segmentFailed || segmentIncomplete)) {
    return 'segment';
  }

  if (item.status === 'ready' || item.status === 'done' || item.status === 'failed') {
    if (item.segment_status === 'completed') return 'post-process';
  }

  if (item.primary_segment_id && item.segment_status === 'completed') {
    return 'segment';
  }

  if (item.primary_segment_id && isKnowledgeItemPipelineActive(item)) {
    return 'segment';
  }

  if (captureUsesPostProcess(item) && isKnowledgeItemPipelineActive(item)) {
    return 'post-process';
  }

  return null;
}

export function resolveKnowledgeItemRunAction(item: ChannelKnowledgeItem): KnowledgeItemRunAction | null {
  if (isKnowledgeItemPipelineActive(item)) return null;
  return resolveKnowledgeItemRunTarget(item);
}

export function isKnowledgeItemRunBusy(item: ChannelKnowledgeItem): boolean {
  return isKnowledgeItemPipelineActive(item);
}

export function knowledgeItemRunActionLabel(
  item: ChannelKnowledgeItem,
  action: KnowledgeItemRunAction,
): string {
  const segmentFailed =
    item.segment_status === 'failed' || item.segment_pipeline_job?.stage === 'failed';
  const segmentDone =
    item.segment_status === 'completed' || item.segment_pipeline_job?.stage === 'done';

  if (action === 'segment') {
    if (segmentFailed) return item.input_mode === 'document' ? 'Retry parse' : 'Retry transcribe';
    if (segmentDone) return item.input_mode === 'document' ? 'Re-run parse' : 'Re-transcribe';
    return item.input_mode === 'document' ? 'Run parse' : 'Transcribe';
  }

  const postProcessFailed =
    item.status === 'failed' || item.pipeline_job?.stage === 'failed';
  if (postProcessFailed) return 'Retry post-process';
  return 'Run post-process';
}

export function knowledgeItemRunBusyLabel(
  item: ChannelKnowledgeItem,
  action: KnowledgeItemRunAction,
): string {
  if (action === 'segment') {
    return item.input_mode === 'document' ? 'Parsing…' : 'Transcribing…';
  }
  return 'Post-processing…';
}
