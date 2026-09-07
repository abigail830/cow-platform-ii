import { desc, eq, inArray } from 'drizzle-orm';
import {
  appDocumentCapturePipelineJobs,
  appDocumentCaptures,
  appDocumentCaptureSegments,
  db,
  type CapturePipelineJobStage,
} from '../../infrastructure/db/index.ts';
import { getS3Config } from '../../infrastructure/oss/s3-config.ts';
import {
  captureStoragePrefix,
  structuredTranscriptS3Key,
  recordingContextS3Key,
  extractionS3Key,
  summaryS3Key,
} from '../../document/infrastructure/audio-capture-files.ts';
import { transcriptS3Key, asrResultS3Key } from '../../audio/infrastructure/audio-files.ts';
import { snapshotConfigYaml } from '../../audio/application/audio-pipeline-jobs.ts';

export async function createDocumentCapturePipelineJob(input: {
  captureId: string;
  pipelineName: string;
  configYaml?: string | null;
}): Promise<typeof appDocumentCapturePipelineJobs.$inferSelect> {
  const [row] = await db
    .insert(appDocumentCapturePipelineJobs)
    .values({
      captureId: input.captureId,
      pipelineName: input.pipelineName,
      stage: 'submitted',
      configYaml: snapshotConfigYaml(input.configYaml),
    })
    .returning();
  return row!;
}

export async function getDocumentCapturePipelineJobById(
  id: string,
): Promise<typeof appDocumentCapturePipelineJobs.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(appDocumentCapturePipelineJobs)
    .where(eq(appDocumentCapturePipelineJobs.id, id))
    .limit(1);
  return row ?? null;
}

export async function getLatestDocumentCapturePipelineJob(
  captureId: string,
): Promise<typeof appDocumentCapturePipelineJobs.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(appDocumentCapturePipelineJobs)
    .where(eq(appDocumentCapturePipelineJobs.captureId, captureId))
    .orderBy(desc(appDocumentCapturePipelineJobs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getLatestDocumentCapturePipelineJobsForCaptures(
  captureIds: string[],
): Promise<Map<string, typeof appDocumentCapturePipelineJobs.$inferSelect>> {
  if (captureIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(appDocumentCapturePipelineJobs)
    .where(inArray(appDocumentCapturePipelineJobs.captureId, captureIds))
    .orderBy(desc(appDocumentCapturePipelineJobs.createdAt));

  const map = new Map<string, typeof appDocumentCapturePipelineJobs.$inferSelect>();
  for (const row of rows) {
    if (!map.has(row.captureId)) map.set(row.captureId, row);
  }
  return map;
}

export function documentCapturePipelineJobToPublic(
  job: typeof appDocumentCapturePipelineJobs.$inferSelect,
) {
  return {
    id: job.id,
    stage: job.stage,
    pipeline_name: job.pipelineName,
    error_message: job.errorMessage,
    updated_at: job.updatedAt.toISOString(),
  };
}

export async function updateDocumentCapturePipelineJob(
  id: string,
  input: {
    stage?: CapturePipelineJobStage;
    errorMessage?: string | null;
  },
): Promise<typeof appDocumentCapturePipelineJobs.$inferSelect | null> {
  const [row] = await db
    .update(appDocumentCapturePipelineJobs)
    .set({
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appDocumentCapturePipelineJobs.id, id))
    .returning();
  return row ?? null;
}

export async function buildDocumentCapturePipelineJobContext(jobId: string) {
  const job = await getDocumentCapturePipelineJobById(jobId);
  if (!job) throw new Error('Capture pipeline job not found');

  const [capture] = await db
    .select()
    .from(appDocumentCaptures)
    .where(eq(appDocumentCaptures.id, job.captureId))
    .limit(1);
  if (!capture) throw new Error('Capture not found');

  const segments = await db
    .select()
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.captureId, capture.id))
    .orderBy(appDocumentCaptureSegments.segmentIndex);

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
      input_mode: capture.inputMode,
      metadata: (capture.metadata as Record<string, unknown>) ?? {},
    },
    segments: segments.map((seg) => ({
      id: seg.id,
      segment_index: seg.segmentIndex,
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

export async function markDocumentCaptureForJobStage(
  captureId: string,
  stage: CapturePipelineJobStage,
): Promise<void> {
  if (stage === 'done') {
    await db
      .update(appDocumentCaptures)
      .set({ status: 'done', updatedAt: new Date() })
      .where(eq(appDocumentCaptures.id, captureId));
    return;
  }
  if (stage === 'failed') {
    await db
      .update(appDocumentCaptures)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(appDocumentCaptures.id, captureId));
    return;
  }
  await db
    .update(appDocumentCaptures)
    .set({ status: 'post_processing', updatedAt: new Date() })
    .where(eq(appDocumentCaptures.id, captureId));
}
