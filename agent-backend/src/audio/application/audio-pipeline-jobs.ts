import { desc, eq, inArray } from 'drizzle-orm';
import { appAudioPipelineJobs, appDocumentCaptureSegments, db, type AsyncJobMetrics, type AudioPipelineJobStage } from '../../infrastructure/db/index.ts';
import { getChannelById } from '../../document/application/documents.ts';
import { getS3Config } from '../../infrastructure/oss/s3-config.ts';
import { audioStoragePrefix } from '../../audio/infrastructure/audio-files.ts';
import {
  audioPipelineProviderForName,
  isAudioAsyncPipelineName,
} from '../../audio/domain/audio-pipeline-names.ts';

export {
  ASYNC_AUDIO_PIPELINE_NAMES,
  audioPipelineProviderForName,
  defaultAudioPipelineWorkflowFile,
  DEFAULT_AUDIO_TRANSCRIBE_WORKFLOW_FILE,
  isAudioAsyncPipelineName,
} from '../../audio/domain/audio-pipeline-names.ts';

function s3PrefixFromKey(s3Key: string): string {
  const normalized = s3Key.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx + 1) : normalized;
}

export function snapshotConfigYaml(configYaml: string | null | undefined): string | null {
  const raw = configYaml?.trim();
  return raw ? raw : null;
}

export type AudioPipelineJobContext = {
  id: string;
  audio_id: string;
  pipeline_name: string;
  provider: string;
  stage: AudioPipelineJobStage;
  external_job_id: string | null;
  config_yaml: string | null;
  asr_vocabulary_id_snapshot: string | null;
  error_message: string | null;
  audio: {
    id: string;
    name: string;
    file_type: string;
    s3_key: string;
    file_hash: string;
    channel_id: string;
  };
  input_uri: string;
  s3_prefix: string;
  api_url: string;
  audio_duration_sec: number | null;
  eval_run_item_id: string | null;
};

export async function createAudioPipelineJob(input: {
  documentCaptureSegmentId?: string | null;
  pipelineName: string;
  provider: string;
  configYaml?: string | null;
  asrVocabularyIdSnapshot?: string | null;
  evalRunItemId?: string | null;
}): Promise<typeof appAudioPipelineJobs.$inferSelect> {
  const evalRunItemId = input.evalRunItemId?.trim() || null;
  const documentCaptureSegmentId = input.documentCaptureSegmentId?.trim() || null;
  const refCount = [evalRunItemId, documentCaptureSegmentId].filter(Boolean).length;
  if (refCount !== 1) {
    throw new Error('Audio pipeline job requires exactly one of documentCaptureSegmentId or evalRunItemId');
  }

  const [row] = await db
    .insert(appAudioPipelineJobs)
    .values({
      documentCaptureSegmentId,
      pipelineName: input.pipelineName,
      provider: input.provider,
      stage: 'submitted',
      configYaml: snapshotConfigYaml(input.configYaml),
      asrVocabularyIdSnapshot: input.asrVocabularyIdSnapshot?.trim() || null,
      evalRunItemId,
    })
    .returning();
  return row!;
}

export async function getAudioPipelineJobById(
  id: string,
): Promise<typeof appAudioPipelineJobs.$inferSelect | null> {
  const [row] = await db.select().from(appAudioPipelineJobs).where(eq(appAudioPipelineJobs.id, id)).limit(1);
  return row ?? null;
}

export async function getLatestAudioPipelineJobsForDocumentCaptureSegments(
  segmentIds: string[],
): Promise<Map<string, typeof appAudioPipelineJobs.$inferSelect>> {
  if (segmentIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(appAudioPipelineJobs)
    .where(inArray(appAudioPipelineJobs.documentCaptureSegmentId, segmentIds))
    .orderBy(desc(appAudioPipelineJobs.createdAt));

  const map = new Map<string, typeof appAudioPipelineJobs.$inferSelect>();
  for (const row of rows) {
    if (!row.documentCaptureSegmentId) continue;
    if (!map.has(row.documentCaptureSegmentId)) {
      map.set(row.documentCaptureSegmentId, row);
    }
  }
  return map;
}

export const GENERIC_AUDIO_GHA_FAILURE_MESSAGE =
  'GitHub Actions worker failed before audio transcription completed';

/** Keep a specific CLI/provider error when GHA failure step sends a generic message. */
export function resolveAudioPipelineJobErrorMessage(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const next = incoming?.trim() || null;
  const prev = existing?.trim();
  if (
    next === GENERIC_AUDIO_GHA_FAILURE_MESSAGE &&
    prev &&
    prev !== GENERIC_AUDIO_GHA_FAILURE_MESSAGE
  ) {
    return prev;
  }
  return next;
}

export function audioPipelineJobToPublic(job: typeof appAudioPipelineJobs.$inferSelect) {
  return {
    id: job.id,
    stage: job.stage,
    pipeline_name: job.pipelineName,
    error_message: job.errorMessage,
    external_job_id: job.externalJobId,
    updated_at: job.updatedAt.toISOString(),
  };
}

export async function updateAudioPipelineJob(
  id: string,
  input: {
    stage?: AudioPipelineJobStage;
    externalJobId?: string | null;
    errorMessage?: string | null;
    metrics?: AsyncJobMetrics | null;
  },
): Promise<typeof appAudioPipelineJobs.$inferSelect | null> {
  const [row] = await db
    .update(appAudioPipelineJobs)
    .set({
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.externalJobId !== undefined ? { externalJobId: input.externalJobId } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      ...(input.metrics !== undefined ? { metrics: input.metrics } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appAudioPipelineJobs.id, id))
    .returning();
  return row ?? null;
}

export async function buildAudioPipelineJobContext(jobId: string): Promise<AudioPipelineJobContext> {
  const job = await getAudioPipelineJobById(jobId);
  if (!job) throw new Error('Audio pipeline job not found');

  const s3 = getS3Config();
  if (!s3) throw new Error('Object storage is not configured');

  const apiUrl =
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;

  if (job.evalRunItemId) {
    const { buildEvalLinkedAudioPipelineContextOverrides } = await import('../../eval/application/eval-audio-bridge.ts');
    const overrides = await buildEvalLinkedAudioPipelineContextOverrides(job.evalRunItemId);
    if (!overrides) throw new Error('Eval run item not found');

    return {
      id: job.id,
      audio_id: job.evalRunItemId,
      pipeline_name: job.pipelineName,
      provider: job.provider,
      stage: job.stage as AudioPipelineJobStage,
      external_job_id: job.externalJobId,
      config_yaml: job.configYaml ?? null,
      asr_vocabulary_id_snapshot: job.asrVocabularyIdSnapshot ?? null,
      error_message: job.errorMessage,
      audio: {
        id: job.evalRunItemId,
        name: overrides.dataset_item_name,
        file_type: overrides.file_type,
        s3_key: overrides.s3_key,
        file_hash: overrides.file_hash,
        channel_id: '',
      },
      input_uri: overrides.input_uri,
      s3_prefix: overrides.s3_prefix,
      api_url: apiUrl,
      audio_duration_sec: overrides.audio_duration_sec,
      eval_run_item_id: job.evalRunItemId,
    };
  }

  if (job.documentCaptureSegmentId) {
    const [segment] = await db
      .select()
      .from(appDocumentCaptureSegments)
      .where(eq(appDocumentCaptureSegments.id, job.documentCaptureSegmentId))
      .limit(1);
    if (!segment) throw new Error('Document capture segment not found');

    const channel = await getChannelById(segment.channelId);
    if (!channel) throw new Error('Channel not found');

    const inputUri = `s3://${s3.bucket}/${segment.s3Key}`;
    const s3Prefix = s3PrefixFromKey(segment.s3Key) || audioStoragePrefix(segment.fileHash);

    return {
      id: job.id,
      audio_id: segment.id,
      pipeline_name: job.pipelineName,
      provider: job.provider,
      stage: job.stage as AudioPipelineJobStage,
      external_job_id: job.externalJobId,
      config_yaml: job.configYaml ?? null,
      asr_vocabulary_id_snapshot: job.asrVocabularyIdSnapshot ?? null,
      error_message: job.errorMessage,
      audio: {
        id: segment.id,
        name: segment.name,
        file_type: segment.fileType,
        s3_key: segment.s3Key,
        file_hash: segment.fileHash,
        channel_id: segment.channelId,
      },
      input_uri: inputUri,
      s3_prefix: s3Prefix,
      api_url: apiUrl,
      audio_duration_sec: segment.durationSec,
      eval_run_item_id: null,
    };
  }

  throw new Error('Audio pipeline job has no document capture segment or eval run item');
}

export async function markDocumentCaptureSegmentForAudioPipelineJobStage(
  segmentId: string,
  stage: AudioPipelineJobStage,
): Promise<void> {
  const { markDocumentCaptureSegmentForAudioJobStage } = await import(
    '../../document/application/document-capture-segment-pipeline.ts'
  );
  await markDocumentCaptureSegmentForAudioJobStage(segmentId, stage);
}

