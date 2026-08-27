import { desc, eq, inArray } from 'drizzle-orm';
import {
  appAudioCapturePipelineJobs,
  appAudioCaptures,
  appAudios,
  db,
  type CapturePipelineJobStage,
} from '../../db/index.ts';
import { getS3Config } from '../../storage/s3-config.ts';
import {
  captureStoragePrefix,
  structuredTranscriptS3Key,
  recordingContextS3Key,
  extractionS3Key,
  summaryS3Key,
} from '../../storage/audio-capture-files.ts';
import { transcriptS3Key, asrResultS3Key } from '../../storage/audio-files.ts';
import { snapshotConfigYaml } from './audio-pipeline-jobs.ts';

export const CAPTURE_POST_PROCESS_PIPELINE_NAME = 'audio-capture-post-process';

export type CapturePipelineJobContext = {
  id: string;
  capture_id: string;
  pipeline_name: string;
  stage: CapturePipelineJobStage;
  config_yaml: string | null;
  error_message: string | null;
  capture: {
    id: string;
    channel_id: string;
    title: string;
    brief: string | null;
    participants_hint: string | null;
    recording_mode: string | null;
    audience: string;
    metadata: Record<string, unknown>;
  };
  segments: Array<{
    id: string;
    segment_index: number;
    segment_label: string | null;
    name: string;
    file_hash: string;
    status: string;
    transcript_s3_key: string;
    asr_result_s3_key: string;
  }>;
  s3_prefix: string;
  api_url: string;
  bucket: string;
  artifact_keys: {
    structured_transcript: string;
    recording_context: string;
    extraction: string;
    summary: string;
  };
};

export async function createCapturePipelineJob(input: {
  captureId: string;
  pipelineName: string;
  configYaml?: string | null;
}): Promise<typeof appAudioCapturePipelineJobs.$inferSelect> {
  const [row] = await db
    .insert(appAudioCapturePipelineJobs)
    .values({
      captureId: input.captureId,
      pipelineName: input.pipelineName,
      stage: 'submitted',
      configYaml: snapshotConfigYaml(input.configYaml),
    })
    .returning();
  return row!;
}

export async function getCapturePipelineJobById(
  id: string,
): Promise<typeof appAudioCapturePipelineJobs.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(appAudioCapturePipelineJobs)
    .where(eq(appAudioCapturePipelineJobs.id, id))
    .limit(1);
  return row ?? null;
}

export async function getLatestCapturePipelineJob(
  captureId: string,
): Promise<typeof appAudioCapturePipelineJobs.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(appAudioCapturePipelineJobs)
    .where(eq(appAudioCapturePipelineJobs.captureId, captureId))
    .orderBy(desc(appAudioCapturePipelineJobs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getLatestCapturePipelineJobsForCaptures(
  captureIds: string[],
): Promise<Map<string, typeof appAudioCapturePipelineJobs.$inferSelect>> {
  if (captureIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(appAudioCapturePipelineJobs)
    .where(inArray(appAudioCapturePipelineJobs.captureId, captureIds))
    .orderBy(desc(appAudioCapturePipelineJobs.createdAt));

  const map = new Map<string, typeof appAudioCapturePipelineJobs.$inferSelect>();
  for (const row of rows) {
    if (!map.has(row.captureId)) map.set(row.captureId, row);
  }
  return map;
}

export function capturePipelineJobToPublic(job: typeof appAudioCapturePipelineJobs.$inferSelect) {
  return {
    id: job.id,
    stage: job.stage,
    pipeline_name: job.pipelineName,
    error_message: job.errorMessage,
    updated_at: job.updatedAt.toISOString(),
  };
}

export async function updateCapturePipelineJob(
  id: string,
  input: {
    stage?: CapturePipelineJobStage;
    errorMessage?: string | null;
  },
): Promise<typeof appAudioCapturePipelineJobs.$inferSelect | null> {
  const [row] = await db
    .update(appAudioCapturePipelineJobs)
    .set({
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appAudioCapturePipelineJobs.id, id))
    .returning();
  return row ?? null;
}

export async function buildCapturePipelineJobContext(
  jobId: string,
): Promise<CapturePipelineJobContext> {
  const job = await getCapturePipelineJobById(jobId);
  if (!job) throw new Error('Capture pipeline job not found');

  const [capture] = await db
    .select()
    .from(appAudioCaptures)
    .where(eq(appAudioCaptures.id, job.captureId))
    .limit(1);
  if (!capture) throw new Error('Capture not found');

  const segments = await db
    .select()
    .from(appAudios)
    .where(eq(appAudios.captureId, capture.id))
    .orderBy(appAudios.segmentIndex);

  const s3 = getS3Config();
  if (!s3) throw new Error('Object storage is not configured');

  const apiUrl =
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;

  return {
    id: job.id,
    capture_id: capture.id,
    pipeline_name: job.pipelineName,
    stage: job.stage as CapturePipelineJobStage,
    config_yaml: job.configYaml ?? null,
    error_message: job.errorMessage,
    capture: {
      id: capture.id,
      channel_id: capture.channelId,
      title: capture.title,
      brief: capture.brief,
      participants_hint: capture.participantsHint,
      recording_mode: capture.recordingMode,
      audience: capture.audience,
      metadata: (capture.metadata as Record<string, unknown>) ?? {},
    },
    segments: segments.map((seg) => ({
      id: seg.id,
      segment_index: seg.segmentIndex ?? 0,
      segment_label: seg.segmentLabel,
      name: seg.name,
      file_hash: seg.fileHash,
      status: seg.status,
      transcript_s3_key: transcriptS3Key(seg.fileHash),
      asr_result_s3_key: asrResultS3Key(seg.fileHash),
    })),
    s3_prefix: captureStoragePrefix(capture.id),
    api_url: apiUrl,
    bucket: s3.bucket,
    artifact_keys: {
      structured_transcript: structuredTranscriptS3Key(capture.id),
      recording_context: recordingContextS3Key(capture.id),
      extraction: extractionS3Key(capture.id),
      summary: summaryS3Key(capture.id),
    },
  };
}

export async function markCaptureForJobStage(
  captureId: string,
  stage: CapturePipelineJobStage,
): Promise<void> {
  if (stage === 'done') {
    await db
      .update(appAudioCaptures)
      .set({ status: 'done', updatedAt: new Date() })
      .where(eq(appAudioCaptures.id, captureId));
    return;
  }
  if (stage === 'failed') {
    await db
      .update(appAudioCaptures)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(appAudioCaptures.id, captureId));
    return;
  }
  await db
    .update(appAudioCaptures)
    .set({ status: 'post_processing', updatedAt: new Date() })
    .where(eq(appAudioCaptures.id, captureId));
}
