import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { appAudioChannels, appAudios, db } from '../db/index.ts';
import { getPipelineConfigById } from '../shared/pipeline-config-store.ts';
import { buildChannelTree, collectDescendantIds } from './channel-tree.ts';
import {
  audioPipelineJobToPublic,
  getLatestAudioPipelineJobForAudio,
  getLatestAudioPipelineJobsForAudios,
} from './audio-pipeline-jobs.ts';
import { reconcileStaleAudioPipelineJobs } from './audio-pipeline-reconcile.ts';
import { isAudioAsyncPipelineName, ASYNC_AUDIO_PIPELINE_NAMES } from './audio-pipeline-names.ts';
import {
  isCapturePostProcessPipelineName,
  CAPTURE_POST_PROCESS_PIPELINE_NAMES,
} from './capture-post-process-pipeline-names.ts';

export type AudioChannelRow = typeof appAudioChannels.$inferSelect;
export type AudioRow = typeof appAudios.$inferSelect;

export type AudioChannelNode = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  pipeline_id: string | null;
  post_process_pipeline_id: string | null;
  auto_start_pipeline: boolean;
  created_at: string;
  updated_at: string;
  children: AudioChannelNode[];
};

function toChannelPublic(row: AudioChannelRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parent_id: row.parentId,
    sort_order: row.sortOrder,
    pipeline_id: row.pipelineId,
    post_process_pipeline_id: row.postProcessPipelineId,
    auto_start_pipeline: row.autoStartPipeline,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toAudioPublic(
  row: AudioRow,
  job?: Awaited<ReturnType<typeof getLatestAudioPipelineJobForAudio>>,
) {
  return {
    id: row.id,
    channel_id: row.channelId,
    capture_id: row.captureId,
    segment_index: row.segmentIndex,
    segment_label: row.segmentLabel,
    name: row.name,
    file_type: row.fileType,
    size_bytes: row.sizeBytes,
    file_hash: row.fileHash,
    s3_key: row.s3Key,
    status: row.status,
    duration_sec: row.durationSec,
    metadata: row.metadata ?? {},
    uploaded_by: row.uploadedBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pipeline_job: job ? audioPipelineJobToPublic(job) : null,
  };
}

export async function listAudioChannelTree(): Promise<AudioChannelNode[]> {
  const rows = await db
    .select()
    .from(appAudioChannels)
    .orderBy(asc(appAudioChannels.sortOrder), asc(appAudioChannels.name));

  return buildChannelTree(rows.map(toChannelPublic));
}

export async function getAudioChannelById(id: string): Promise<AudioChannelRow | null> {
  const [row] = await db.select().from(appAudioChannels).where(eq(appAudioChannels.id, id)).limit(1);
  return row ?? null;
}

export async function createAudioChannel(input: {
  name: string;
  description?: string | null;
  parentId?: string | null;
  createdBy?: string | null;
}): Promise<ReturnType<typeof toChannelPublic>> {
  const name = input.name.trim();
  if (!name || name.length > 256) throw new Error('Channel name must be 1–256 characters');

  let parent: AudioChannelRow | null = null;
  if (input.parentId) {
    parent = await getAudioChannelById(input.parentId);
    if (!parent) throw new Error('Parent channel not found');
  }

  const siblings = await db
    .select({ sortOrder: appAudioChannels.sortOrder })
    .from(appAudioChannels)
    .where(
      input.parentId
        ? eq(appAudioChannels.parentId, input.parentId)
        : isNull(appAudioChannels.parentId),
    );

  const maxSort = siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1);

  const [row] = await db
    .insert(appAudioChannels)
    .values({
      name,
      description: input.description?.trim() || null,
      parentId: input.parentId ?? null,
      sortOrder: maxSort + 1,
      pipelineId: parent?.pipelineId ?? null,
      postProcessPipelineId: parent?.postProcessPipelineId ?? null,
      autoStartPipeline: parent?.pipelineId ? parent.autoStartPipeline : false,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return toChannelPublic(row!);
}

export async function updateAudioChannel(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    parentId?: string | null;
    pipelineId?: string | null;
    postProcessPipelineId?: string | null;
    autoStartPipeline?: boolean;
  },
): Promise<ReturnType<typeof toChannelPublic>> {
  const existing = await getAudioChannelById(id);
  if (!existing) throw new Error('Channel not found');

  if (input.pipelineId !== undefined && input.pipelineId !== null) {
    const pipeline = await getPipelineConfigById(input.pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');
    if (!pipeline.isEnabled) throw new Error('Pipeline is disabled');
    if (!isAudioAsyncPipelineName(pipeline.pipelineName)) {
      throw new Error(
        `Channel transcription pipeline must be an async audio transcribe pipeline ` +
          `(${[...ASYNC_AUDIO_PIPELINE_NAMES].join(', ')}). Got: ${pipeline.pipelineName}`,
      );
    }
  }

  if (input.postProcessPipelineId !== undefined && input.postProcessPipelineId !== null) {
    const pipeline = await getPipelineConfigById(input.postProcessPipelineId);
    if (!pipeline) throw new Error('Post-process pipeline not found');
    if (!pipeline.isEnabled) throw new Error('Post-process pipeline is disabled');
    if (!isCapturePostProcessPipelineName(pipeline.pipelineName)) {
      throw new Error(
        `Channel post-process pipeline must be a capture post-process pipeline ` +
          `(${[...CAPTURE_POST_PROCESS_PIPELINE_NAMES].join(', ')}). Got: ${pipeline.pipelineName}`,
      );
    }
  }

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) throw new Error('Channel cannot be its own parent');
    const parent = await getAudioChannelById(input.parentId);
    if (!parent) throw new Error('Parent channel not found');
    const allRows = await db
      .select({ id: appAudioChannels.id, parentId: appAudioChannels.parentId })
      .from(appAudioChannels);
    const descendants = collectDescendantIds(
      id,
      allRows.map((row) => ({ id: row.id, parent_id: row.parentId })),
    );
    if (descendants.has(input.parentId)) {
      throw new Error('Cannot move channel under its own descendant');
    }
  }

  if (input.pipelineId !== undefined && input.pipelineId === null) {
    input.autoStartPipeline = false;
  }

  const previousPipelineId = existing.pipelineId;

  const [row] = await db
    .update(appAudioChannels)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.pipelineId !== undefined ? { pipelineId: input.pipelineId } : {}),
      ...(input.postProcessPipelineId !== undefined
        ? { postProcessPipelineId: input.postProcessPipelineId }
        : {}),
      ...(input.autoStartPipeline !== undefined ? { autoStartPipeline: input.autoStartPipeline } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appAudioChannels.id, id))
    .returning();

  if (input.pipelineId !== undefined) {
    const { syncChannelAsrVocabularyIfPipelineChanged } = await import('./asr-hotwords.ts');
    await syncChannelAsrVocabularyIfPipelineChanged(
      id,
      previousPipelineId,
      input.pipelineId ?? null,
    );
  }

  return toChannelPublic(row!);
}

export async function deleteAudioChannel(id: string): Promise<void> {
  const existing = await getAudioChannelById(id);
  if (!existing) throw new Error('Channel not found');

  const [child] = await db
    .select({ id: appAudioChannels.id })
    .from(appAudioChannels)
    .where(eq(appAudioChannels.parentId, id))
    .limit(1);
  if (child) throw new Error('Channel has sub-channels. Delete or move them first.');

  const [audio] = await db
    .select({ id: appAudios.id })
    .from(appAudios)
    .where(eq(appAudios.channelId, id))
    .limit(1);
  if (audio) throw new Error('Channel contains audio files. Delete or move them first.');

  await db.delete(appAudioChannels).where(eq(appAudioChannels.id, id));
}

export async function listAudios(input: {
  channelId: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<{ items: ReturnType<typeof toAudioPublic>[]; total: number }> {
  const channel = await getAudioChannelById(input.channelId);
  if (!channel) throw new Error('Channel not found');

  const offset = Math.max(input.offset ?? 0, 0);
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const search = input.search?.trim();

  const conditions = [eq(appAudios.channelId, input.channelId)];
  if (search) {
    conditions.push(sql`${appAudios.name} ILIKE ${`%${search}%`}`);
  }

  const whereClause = and(...conditions);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appAudios)
    .where(whereClause);

  const rows = await db
    .select()
    .from(appAudios)
    .where(whereClause)
    .orderBy(sql`${appAudios.updatedAt} DESC`)
    .limit(limit)
    .offset(offset);

  await reconcileStaleAudioPipelineJobs(rows.map((row) => row.id));

  const jobMap = await getLatestAudioPipelineJobsForAudios(rows.map((row) => row.id));

  return {
    items: rows.map((row) => toAudioPublic(row, jobMap.get(row.id))),
    total: countRow?.count ?? 0,
  };
}

export async function getAudioById(id: string): Promise<AudioRow | null> {
  const [row] = await db.select().from(appAudios).where(eq(appAudios.id, id)).limit(1);
  return row ?? null;
}

export async function getAudioPublicById(id: string): Promise<ReturnType<typeof toAudioPublic> | null> {
  await reconcileStaleAudioPipelineJobs([id]);
  const row = await getAudioById(id);
  if (!row) return null;
  const job = await getLatestAudioPipelineJobForAudio(id);
  return toAudioPublic(row, job);
}

export async function createAudioRecord(input: {
  channelId: string;
  name: string;
  fileType: string;
  sizeBytes: number;
  fileHash: string;
  s3Key: string;
  uploadedBy?: string | null;
}): Promise<ReturnType<typeof toAudioPublic>> {
  const channel = await getAudioChannelById(input.channelId);
  if (!channel) throw new Error('Channel not found');

  const [row] = await db
    .insert(appAudios)
    .values({
      channelId: input.channelId,
      name: input.name,
      fileType: input.fileType,
      sizeBytes: input.sizeBytes,
      fileHash: input.fileHash,
      s3Key: input.s3Key,
      status: 'uploaded',
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning();

  return toAudioPublic(row!);
}

export async function deleteAudio(id: string): Promise<AudioRow> {
  const existing = await getAudioById(id);
  if (!existing) throw new Error('Audio not found');
  await db.delete(appAudios).where(eq(appAudios.id, id));
  return existing;
}

export async function updateAudioMetadata(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ metadata: Record<string, unknown> }> {
  const existing = await getAudioById(id);
  if (!existing) throw new Error('Audio not found');

  const merged = { ...(existing.metadata ?? {}), ...patch };
  await db
    .update(appAudios)
    .set({ metadata: merged, updatedAt: new Date() })
    .where(eq(appAudios.id, id));

  return { metadata: merged };
}

export async function getAudioStats(channelIds?: Set<string>): Promise<{ channels: number; audios: number }> {
  if (channelIds && channelIds.size === 0) {
    return { channels: 0, audios: 0 };
  }

  const channelCountQuery = channelIds
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(appAudioChannels)
        .where(inArray(appAudioChannels.id, [...channelIds]))
    : db.select({ count: sql<number>`count(*)::int` }).from(appAudioChannels);

  const audioCountQuery = channelIds
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(appAudios)
        .where(inArray(appAudios.channelId, [...channelIds]))
    : db.select({ count: sql<number>`count(*)::int` }).from(appAudios);

  const [channelRow] = await channelCountQuery;
  const [audioRow] = await audioCountQuery;
  return {
    channels: channelRow?.count ?? 0,
    audios: audioRow?.count ?? 0,
  };
}
