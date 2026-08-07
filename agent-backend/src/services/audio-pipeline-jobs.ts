import { desc, eq, inArray } from 'drizzle-orm';
import { appAudios, appAudioPipelineJobs, db, type AudioPipelineJobStage } from '../db/index.ts';
import { getAudioChannelById } from './audios.ts';
import { getS3Config } from '../storage/s3-config.ts';
import { audioStoragePrefix } from '../storage/audio-files.ts';
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
};

export async function createAudioPipelineJob(input: {
  audioId: string;
  pipelineName: string;
  provider: string;
  configYaml?: string | null;
}): Promise<typeof appAudioPipelineJobs.$inferSelect> {
  const [row] = await db
    .insert(appAudioPipelineJobs)
    .values({
      audioId: input.audioId,
      pipelineName: input.pipelineName,
      provider: input.provider,
      stage: 'submitted',
      configYaml: snapshotConfigYaml(input.configYaml),
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

  const [audio] = await db.select().from(appAudios).where(eq(appAudios.id, job.audioId)).limit(1);
  if (!audio) throw new Error('Audio not found');

  const s3 = getS3Config();
  if (!s3) throw new Error('Object storage is not configured');

  const channel = await getAudioChannelById(audio.channelId);
  if (!channel) throw new Error('Channel not found');

  const apiUrl =
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;

  return {
    id: job.id,
    audio_id: audio.id,
    pipeline_name: job.pipelineName,
    provider: job.provider,
    stage: job.stage as AudioPipelineJobStage,
    external_job_id: job.externalJobId,
    config_yaml: job.configYaml ?? null,
    error_message: job.errorMessage,
    audio: {
      id: audio.id,
      name: audio.name,
      file_type: audio.fileType,
      s3_key: audio.s3Key,
      file_hash: audio.fileHash,
      channel_id: audio.channelId,
    },
    input_uri: `s3://${s3.bucket}/${audio.s3Key}`,
    s3_prefix: s3PrefixFromKey(audio.s3Key) || audioStoragePrefix(audio.fileHash),
    api_url: apiUrl,
  };
}

export async function markAudioForJobStage(
  audioId: string,
  stage: AudioPipelineJobStage,
): Promise<void> {
  if (stage === 'done') {
    await db
      .update(appAudios)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(appAudios.id, audioId));
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
