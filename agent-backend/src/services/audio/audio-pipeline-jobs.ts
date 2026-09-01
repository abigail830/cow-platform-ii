import { desc, eq, inArray } from 'drizzle-orm';
import { appAudios, appAudioPipelineJobs, db, type AudioPipelineJobStage } from '../../db/index.ts';
import { getAudioChannelById } from './audios.ts';
import { getS3Config } from '../../storage/s3-config.ts';
import { audioStoragePrefix } from '../../storage/audio-files.ts';
import {
  audioPipelineProviderForName,
  isAudioAsyncPipelineName,
} from './audio-pipeline-names.ts';

export {
  ASYNC_AUDIO_PIPELINE_NAMES,
  audioPipelineProviderForName,
  defaultAudioPipelineWorkflowFile,
  DEFAULT_AUDIO_TRANSCRIBE_WORKFLOW_FILE,
  isAudioAsyncPipelineName,
} from './audio-pipeline-names.ts';

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
  audioId?: string | null;
  pipelineName: string;
  provider: string;
  configYaml?: string | null;
  asrVocabularyIdSnapshot?: string | null;
  evalRunItemId?: string | null;
}): Promise<typeof appAudioPipelineJobs.$inferSelect> {
  const evalRunItemId = input.evalRunItemId?.trim() || null;
  const audioId = input.audioId?.trim() || null;
  if (!evalRunItemId && !audioId) {
    throw new Error('Audio pipeline job requires audioId or evalRunItemId');
  }
  if (evalRunItemId && audioId) {
    throw new Error('Eval audio pipeline jobs must not reference library audio');
  }

  const [row] = await db
    .insert(appAudioPipelineJobs)
    .values({
      audioId,
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

export async function getLatestAudioPipelineJobForAudio(
  audioId: string,
): Promise<typeof appAudioPipelineJobs.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(appAudioPipelineJobs)
    .where(eq(appAudioPipelineJobs.audioId, audioId))
    .orderBy(desc(appAudioPipelineJobs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getLatestAudioPipelineJobsForAudios(
  audioIds: string[],
): Promise<Map<string, typeof appAudioPipelineJobs.$inferSelect>> {
  if (audioIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(appAudioPipelineJobs)
    .where(inArray(appAudioPipelineJobs.audioId, audioIds))
    .orderBy(desc(appAudioPipelineJobs.createdAt));

  const map = new Map<string, typeof appAudioPipelineJobs.$inferSelect>();
  for (const row of rows) {
    if (!map.has(row.audioId)) map.set(row.audioId, row);
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
  },
): Promise<typeof appAudioPipelineJobs.$inferSelect | null> {
  const [row] = await db
    .update(appAudioPipelineJobs)
    .set({
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.externalJobId !== undefined ? { externalJobId: input.externalJobId } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
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
    const { buildEvalLinkedAudioPipelineContextOverrides } = await import('../eval/eval-audio-bridge.ts');
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

  if (!job.audioId) throw new Error('Audio pipeline job has no library audio');

  const [audio] = await db.select().from(appAudios).where(eq(appAudios.id, job.audioId)).limit(1);
  if (!audio) throw new Error('Audio not found');

  const channel = await getAudioChannelById(audio.channelId);
  if (!channel) throw new Error('Channel not found');

  let inputUri = `s3://${s3.bucket}/${audio.s3Key}`;
  let s3Prefix = s3PrefixFromKey(audio.s3Key) || audioStoragePrefix(audio.fileHash);
  let displayName = audio.name;
  let audioDurationSec: number | null = null;

  return {
    id: job.id,
    audio_id: audio.id,
    pipeline_name: job.pipelineName,
    provider: job.provider,
    stage: job.stage as AudioPipelineJobStage,
    external_job_id: job.externalJobId,
    config_yaml: job.configYaml ?? null,
    asr_vocabulary_id_snapshot: job.asrVocabularyIdSnapshot ?? null,
    error_message: job.errorMessage,
    audio: {
      id: audio.id,
      name: displayName,
      file_type: audio.fileType,
      s3_key: audio.s3Key,
      file_hash: audio.fileHash,
      channel_id: audio.channelId,
    },
    input_uri: inputUri,
    s3_prefix: s3Prefix,
    api_url: apiUrl,
    audio_duration_sec: audioDurationSec,
    eval_run_item_id: null,
  };
}

export async function markAudioForJobStage(
  audioId: string,
  stage: AudioPipelineJobStage,
): Promise<void> {
  const [audio] = await db
    .select({ captureId: appAudios.captureId, metadata: appAudios.metadata })
    .from(appAudios)
    .where(eq(appAudios.id, audioId))
    .limit(1);
  if (!audio) return;

  const { isEvalShadowAudio } = await import('../eval/eval-shadow-audio.ts');
  if (isEvalShadowAudio(audio.metadata as Record<string, unknown> | null)) {
    return;
  }

  if (stage === 'done') {
    await db
      .update(appAudios)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(appAudios.id, audioId));

    if (audio.captureId) {
      const { maybeStartCapturePostProcess } = await import('../capture/capture-post-process-trigger.ts');
      try {
        await maybeStartCapturePostProcess(audio.captureId);
      } catch (error) {
        console.error(
          `[capture-post-process] auto-start failed for capture ${audio.captureId}:`,
          error instanceof Error ? error.message : error,
        );
      }
      const { syncCaptureStatus } = await import('../capture/capture-status.ts');
      await syncCaptureStatus(audio.captureId);
    }
    return;
  }
  if (stage === 'failed') {
    await db
      .update(appAudios)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(appAudios.id, audioId));
    return;
  }
  await db
    .update(appAudios)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(appAudios.id, audioId));
}
