import { eq } from 'drizzle-orm';
import {
  appDocumentCaptureSegments,
  appDocumentCaptures,
  appDocuments,
  db,
  type AudioPipelineJobStage,
  type PipelineJobStage,
} from '../../infrastructure/db/index.ts';
import { getPipelineConfigById } from '../../pipeline/infrastructure/pipeline-config-store.ts';
import { resolvePipelineConfigYamlSnapshot } from '../../pipeline/domain/pipeline-default-config.ts';
import { isTranscriptSourceMetadata } from './capture/capture-transcript-upload.ts';
import {
  audioPipelineProviderForName,
  createAudioPipelineJob,
  getLatestAudioPipelineJobsForDocumentCaptureSegments,
  isAudioAsyncPipelineName,
} from '../../audio/application/audio-pipeline-jobs.ts';
import { spawnAsyncAudioPipelineWorker } from '../../audio/infrastructure/audio-pipeline-runner.ts';
import { getDocumentChannelAsrVocabularyIdForJob } from '../../audio/application/asr-hotwords.ts';
import { createDocumentCapturePipelineJob } from './document-capture-pipeline-jobs.ts';
import { getChannelById, createDocumentRecord } from './documents.ts';
import {
  resolveDocumentCapturePostProcessPipelineForChannel,
  spawnDocumentCapturePostProcessWorker,
} from './document-capture-pipeline-runner.ts';
import { assessDocumentCaptureReadiness } from './document-capture-readiness.ts';
import { syncDocumentCaptureStatus } from './document-capture-status.ts';
import { retryFailedJob } from '../../pipeline/application/async-job-retry.ts';
import { stripExtractedMetadataFields } from './document-metadata-extraction.ts';
import {
  getLatestPipelineJobForSegment,
  isActivePipelineJobStage,
} from '../../pipeline/application/pipeline-jobs.ts';

const ACTIVE_AUDIO_PIPELINE_JOB_STAGES = new Set<AudioPipelineJobStage>(['submitted', 'transcribing']);

function isActiveAudioPipelineJobStage(stage: string): boolean {
  return ACTIVE_AUDIO_PIPELINE_JOB_STAGES.has(stage as AudioPipelineJobStage);
}

function resolveLibraryDocumentId(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  if (typeof metadata.library_document_id === 'string' && metadata.library_document_id.trim()) {
    return metadata.library_document_id.trim();
  }
  if (typeof metadata.legacy_document_id === 'string' && metadata.legacy_document_id.trim()) {
    return metadata.legacy_document_id.trim();
  }
  return null;
}

async function getSegmentWithCapture(segmentId: string) {
  const [segment] = await db
    .select()
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.id, segmentId))
    .limit(1);
  if (!segment) return null;

  const [capture] = await db
    .select()
    .from(appDocumentCaptures)
    .where(eq(appDocumentCaptures.id, segment.captureId))
    .limit(1);
  if (!capture) return null;

  return { segment, capture };
}

async function ensureSegmentLibraryDocument(
  segment: typeof appDocumentCaptureSegments.$inferSelect,
  captureId: string,
): Promise<string> {
  const knowledgeMetadata = {
    knowledge_capture_id: captureId,
    knowledge_capture_segment_id: segment.id,
    knowledge_archived: true,
  };

  const existingDocumentId = resolveLibraryDocumentId(segment.metadata as Record<string, unknown> | null);
  if (existingDocumentId) {
    const [existing] = await db
      .select({ metadata: appDocuments.metadata })
      .from(appDocuments)
      .where(eq(appDocuments.id, existingDocumentId))
      .limit(1);

    await db
      .update(appDocuments)
      .set({
        metadata: {
          ...(existing?.metadata ?? {}),
          ...knowledgeMetadata,
        },
        updatedAt: new Date(),
      })
      .where(eq(appDocuments.id, existingDocumentId));
    return existingDocumentId;
  }

  const document = await createDocumentRecord({
    channelId: segment.channelId,
    name: segment.name,
    fileType: segment.fileType,
    sizeBytes: segment.sizeBytes,
    fileHash: segment.fileHash,
    s3Key: segment.s3Key,
  });

  await db
    .update(appDocuments)
    .set({
      metadata: knowledgeMetadata,
      updatedAt: new Date(),
    })
    .where(eq(appDocuments.id, document.id));

  await db
    .update(appDocumentCaptureSegments)
    .set({
      metadata: {
        ...(segment.metadata ?? {}),
        library_document_id: document.id,
        knowledge_capture_id: captureId,
      },
      updatedAt: new Date(),
    })
    .where(eq(appDocumentCaptureSegments.id, segment.id));

  return document.id;
}

async function startDocumentCaptureSegmentDocumentPipeline(
  segment: typeof appDocumentCaptureSegments.$inferSelect,
  captureId: string,
): Promise<{ job_id: string }> {
  const documentId = await ensureSegmentLibraryDocument(segment, captureId);

  await db
    .update(appDocumentCaptureSegments)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(appDocumentCaptureSegments.id, segment.id));

  const channel = await getChannelById(segment.channelId);
  if (!channel?.pipelineId) {
    console.info(
      `[document-capture] skip parse — channel ${segment.channelId} has no pipeline_id`,
    );
    return { job_id: '' };
  }

  const pipeline = await getPipelineConfigById(channel.pipelineId);
  if (!pipeline?.isEnabled) {
    throw new Error('Document parse pipeline is not available');
  }

  const { pipelineProviderForName, createPipelineJob, isDocumentAsyncPipelineName } = await import(
    '../../pipeline/application/pipeline-jobs.ts'
  );
  const { spawnAsyncPipelineWorker } = await import('../../pipeline/application/pipeline-runner.ts');

  const provider = pipelineProviderForName(pipeline.pipelineName);
  if (!provider || !isDocumentAsyncPipelineName(pipeline.pipelineName)) {
    throw new Error(`Unsupported document parse pipeline: ${pipeline.pipelineName}`);
  }

  const configYaml = await resolvePipelineConfigYamlSnapshot({
    pipelineName: pipeline.pipelineName,
    configYaml: pipeline.configYaml,
    isSystem: pipeline.isSystem,
  });

  const latestJob = await getLatestPipelineJobForSegment(segment.id);
  const isManualRerun = latestJob?.stage === 'done';
  if (isManualRerun) {
    const [existingDoc] = await db
      .select({ metadata: appDocuments.metadata })
      .from(appDocuments)
      .where(eq(appDocuments.id, documentId))
      .limit(1);
    await db
      .update(appDocuments)
      .set({
        metadata: stripExtractedMetadataFields(existingDoc?.metadata as Record<string, unknown>),
        updatedAt: new Date(),
      })
      .where(eq(appDocuments.id, documentId));
  }

  const job = await createPipelineJob({
    documentCaptureSegmentId: segment.id,
    documentId,
    pipelineName: pipeline.pipelineName,
    provider,
    configYaml,
    metrics: isManualRerun ? { force_metadata_extract: true } : null,
  });

  await spawnAsyncPipelineWorker(job.id, pipeline.pipelineName);
  return { job_id: job.id };
}

async function startDocumentCaptureSegmentAudioPipeline(
  segmentId: string,
  channelId: string,
): Promise<{ job_id: string }> {
  const channel = await getChannelById(channelId);
  if (!channel?.transcriptionPipelineId) {
    console.info(
      `[document-capture] skip ASR — channel ${channelId} has no transcription_pipeline_id`,
    );
    return { job_id: '' };
  }

  const pipeline = await getPipelineConfigById(channel.transcriptionPipelineId);
  if (!pipeline?.isEnabled) {
    throw new Error('Transcription pipeline is not available');
  }

  const provider = audioPipelineProviderForName(pipeline.pipelineName);
  if (!provider || !isAudioAsyncPipelineName(pipeline.pipelineName)) {
    throw new Error(`Unsupported transcription pipeline: ${pipeline.pipelineName}`);
  }

  const configYaml = await resolvePipelineConfigYamlSnapshot({
    pipelineName: pipeline.pipelineName,
    configYaml: pipeline.configYaml,
    isSystem: pipeline.isSystem,
  });

  const job = await createAudioPipelineJob({
    documentCaptureSegmentId: segmentId,
    pipelineName: pipeline.pipelineName,
    provider,
    configYaml,
    asrVocabularyIdSnapshot: await getDocumentChannelAsrVocabularyIdForJob(channelId),
  });

  await db
    .update(appDocumentCaptureSegments)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(appDocumentCaptureSegments.id, segmentId));

  await spawnAsyncAudioPipelineWorker(job.id, pipeline.pipelineName);
  return { job_id: job.id };
}

export async function startDocumentCaptureSegmentPipeline(
  captureId: string,
  segmentId: string,
): Promise<{ status: string; job_id?: string }> {
  const ctx = await getSegmentWithCapture(segmentId);
  if (!ctx) throw new Error('Segment not found');
  if (ctx.capture.id !== captureId) throw new Error('Segment does not belong to this capture');

  const { segment, capture } = ctx;
  if (capture.inputMode === 'transcript') {
    throw new Error('Transcript segments do not require processing');
  }

  if (capture.inputMode === 'document') {
    const latestJob = await getLatestPipelineJobForSegment(segmentId);
    if (latestJob?.stage === 'failed') {
      const retry = await retryFailedJob('document_pipeline', latestJob.id);
      if (retry.retried) {
        await db
          .update(appDocumentCaptureSegments)
          .set({ status: 'running', updatedAt: new Date() })
          .where(eq(appDocumentCaptureSegments.id, segmentId));
        void syncDocumentCaptureStatus(captureId);
        return { status: 'running', job_id: latestJob.id };
      }
    }

    if (latestJob && isActivePipelineJobStage(latestJob.stage)) {
      await db
        .update(appDocumentCaptureSegments)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(appDocumentCaptureSegments.id, segmentId));
      const { spawnAsyncPipelineWorker } = await import('../../pipeline/application/pipeline-runner.ts');
      await spawnAsyncPipelineWorker(latestJob.id, latestJob.pipelineName);
      void syncDocumentCaptureStatus(captureId);
      return { status: 'running', job_id: latestJob.id };
    }

    const started = await startDocumentCaptureSegmentDocumentPipeline(segment, captureId);
    if (!started.job_id) {
      throw new Error('Channel has no document parse pipeline configured');
    }
    void syncDocumentCaptureStatus(captureId);
    return { status: 'running', job_id: started.job_id };
  }

  const audioJobs = await getLatestAudioPipelineJobsForDocumentCaptureSegments([segmentId]);
  const latestJob = audioJobs.get(segmentId) ?? null;
  if (latestJob?.stage === 'failed') {
    const retry = await retryFailedJob('audio_pipeline', latestJob.id);
    if (retry.retried) {
      await db
        .update(appDocumentCaptureSegments)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(appDocumentCaptureSegments.id, segmentId));
      void syncDocumentCaptureStatus(captureId);
      return { status: 'running', job_id: latestJob.id };
    }
  }

  if (latestJob && isActiveAudioPipelineJobStage(latestJob.stage)) {
    await db
      .update(appDocumentCaptureSegments)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(appDocumentCaptureSegments.id, segmentId));
    await spawnAsyncAudioPipelineWorker(latestJob.id, latestJob.pipelineName);
    void syncDocumentCaptureStatus(captureId);
    return { status: 'running', job_id: latestJob.id };
  }

  const started = await startDocumentCaptureSegmentAudioPipeline(segmentId, segment.channelId);
  if (!started.job_id) {
    throw new Error('Channel has no transcription pipeline configured');
  }
  void syncDocumentCaptureStatus(captureId);
  return { status: 'running', job_id: started.job_id };
}

export async function afterDocumentCaptureSegmentAttached(segmentId: string): Promise<void> {
  const ctx = await getSegmentWithCapture(segmentId);
  if (!ctx) return;

  const { segment, capture } = ctx;
  const inputMode = capture.inputMode;

  if (inputMode === 'document') {
    await startDocumentCaptureSegmentDocumentPipeline(segment, capture.id);
  } else if (inputMode === 'audio') {
    await startDocumentCaptureSegmentAudioPipeline(segmentId, segment.channelId);
  } else if (inputMode === 'transcript') {
    await db
      .update(appDocumentCaptureSegments)
      .set({
        status: 'completed',
        metadata: {
          ...(segment.metadata ?? {}),
          source_kind: 'transcript',
        },
        updatedAt: new Date(),
      })
      .where(eq(appDocumentCaptureSegments.id, segmentId));

    void maybeStartDocumentCapturePostProcess(capture.id);
  }

  void syncDocumentCaptureStatus(capture.id);
}

export async function syncDocumentCaptureSegmentFromDocumentPipeline(
  segmentId: string,
  stage: PipelineJobStage,
): Promise<void> {
  const ctx = await getSegmentWithCapture(segmentId);
  if (!ctx) return;

  let segmentStatus = ctx.segment.status;
  if (stage === 'done') segmentStatus = 'completed';
  else if (stage === 'failed') segmentStatus = 'failed';
  else if (stage === 'submitted' || stage === 'parsed' || stage === 'extracted_metadata') {
    segmentStatus = 'running';
  }

  await db
    .update(appDocumentCaptureSegments)
    .set({ status: segmentStatus, updatedAt: new Date() })
    .where(eq(appDocumentCaptureSegments.id, segmentId));

  void syncDocumentCaptureStatus(ctx.capture.id);
}

export async function markDocumentCaptureSegmentForAudioJobStage(
  segmentId: string,
  stage: string,
): Promise<void> {
  const ctx = await getSegmentWithCapture(segmentId);
  if (!ctx) return;

  if (stage === 'done') {
    await db
      .update(appDocumentCaptureSegments)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(appDocumentCaptureSegments.id, segmentId));

    void maybeStartDocumentCapturePostProcess(ctx.capture.id);
  } else if (stage === 'failed') {
    await db
      .update(appDocumentCaptureSegments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(appDocumentCaptureSegments.id, segmentId));
  } else {
    await db
      .update(appDocumentCaptureSegments)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(appDocumentCaptureSegments.id, segmentId));
  }

  void syncDocumentCaptureStatus(ctx.capture.id);
}

export async function maybeStartDocumentCapturePostProcess(captureId: string): Promise<void> {
  const [capture] = await db
    .select()
    .from(appDocumentCaptures)
    .where(eq(appDocumentCaptures.id, captureId))
    .limit(1);
  if (!capture) return;

  if (capture.inputMode === 'document') {
    console.info(
      `[document-capture-post-process] skip — document captures use parse pipeline only (capture ${captureId})`,
    );
    return;
  }

  const readiness = await assessDocumentCaptureReadiness(captureId);
  if (!readiness.ready) return;

  const pipeline = await resolveDocumentCapturePostProcessPipelineForChannel(capture.channelId);
  if (!pipeline?.isEnabled) {
    console.info(
      `[document-capture-post-process] pipeline disabled; skip capture ${captureId}`,
    );
    return;
  }

  const configYaml = await resolvePipelineConfigYamlSnapshot({
    pipelineName: pipeline.pipelineName,
    configYaml: pipeline.configYaml,
    isSystem: pipeline.isSystem,
  });

  const job = await createDocumentCapturePipelineJob({
    captureId,
    pipelineName: pipeline.pipelineName,
    configYaml,
  });

  await db
    .update(appDocumentCaptures)
    .set({ status: 'post_processing', updatedAt: new Date() })
    .where(eq(appDocumentCaptures.id, captureId));

  await spawnDocumentCapturePostProcessWorker(job.id, job.pipelineName);
}

export function isDocumentCaptureTranscriptSegment(metadata: Record<string, unknown> | null | undefined): boolean {
  return isTranscriptSourceMetadata(metadata);
}
