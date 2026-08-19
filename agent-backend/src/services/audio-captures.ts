import { and, asc, desc, eq, ilike, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  appAudioCaptures,
  appAudios,
  db,
  type AudioCaptureAudience,
  type AudioCaptureRecordingMode,
  type AudioCaptureInputMode,
} from '../db/index.ts';
import {
  capturePipelineJobToPublic,
  getLatestCapturePipelineJob,
  getLatestCapturePipelineJobsForCaptures,
} from './audio-capture-pipeline-jobs.ts';
import { getLatestAudioPipelineJobsForAudios, audioPipelineJobToPublic } from './audio-pipeline-jobs.ts';
import {
  resolveCaptureStatusFromSegments,
  type CaptureStatusSegment,
} from './capture-status-resolve.ts';

export type CaptureRow = typeof appAudioCaptures.$inferSelect;

function toCapturePublic(
  row: CaptureRow,
  job?: Awaited<ReturnType<typeof getLatestCapturePipelineJob>>,
  segmentCount = 0,
) {
  return {
    id: row.id,
    channel_id: row.channelId,
    title: row.title,
    brief: row.brief,
    participants_hint: row.participantsHint,
    recording_mode: row.recordingMode,
    audience: row.audience,
    input_mode: row.inputMode,
    status: row.status,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    segment_count: segmentCount,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pipeline_job: job ? capturePipelineJobToPublic(job) : null,
  };
}

function toSegmentPublic(
  row: typeof appAudios.$inferSelect,
  job?: Awaited<ReturnType<typeof getLatestAudioPipelineJobsForAudios>> extends Map<string, infer J>
    ? J
    : never,
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
    status: row.status,
    duration_sec: row.durationSec,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pipeline_job: job ? audioPipelineJobToPublic(job) : null,
  };
}

export async function createAudioCapture(input: {
  channelId: string;
  title: string;
  brief?: string | null;
  participantsHint?: string | null;
  recordingMode?: AudioCaptureRecordingMode | null;
  audience?: AudioCaptureAudience;
  inputMode?: AudioCaptureInputMode;
  createdBy?: string | null;
}): Promise<ReturnType<typeof toCapturePublic>> {
  const [row] = await db
    .insert(appAudioCaptures)
    .values({
      channelId: input.channelId,
      title: input.title.trim(),
      brief: input.brief?.trim() || null,
      participantsHint: input.participantsHint?.trim() || null,
      recordingMode: input.recordingMode ?? null,
      audience: input.audience ?? 'unknown',
      inputMode: input.inputMode ?? 'audio',
      status: 'draft',
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return toCapturePublic(row!, undefined, 0);
}

export async function listAudioCaptures(input: {
  channelId: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ReturnType<typeof toCapturePublic>[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const search = input.search?.trim();

  const conditions = [eq(appAudioCaptures.channelId, input.channelId)];
  if (search) {
    conditions.push(ilike(appAudioCaptures.title, `%${search}%`));
  }

  const where = and(...conditions);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appAudioCaptures)
    .where(where);

  const rows = await db
    .select()
    .from(appAudioCaptures)
    .where(where)
    .orderBy(desc(appAudioCaptures.updatedAt))
    .limit(limit)
    .offset(offset);

  const captureIds = rows.map((r) => r.id);
  const jobs = await getLatestCapturePipelineJobsForCaptures(captureIds);

  const segmentCounts = captureIds.length
    ? await db
        .select({
          captureId: appAudios.captureId,
          count: sql<number>`count(*)::int`,
        })
        .from(appAudios)
        .where(inArray(appAudios.captureId, captureIds))
        .groupBy(appAudios.captureId)
    : [];

  const countMap = new Map(segmentCounts.map((r) => [r.captureId!, r.count]));

  const segmentRows = captureIds.length
    ? await db
        .select({
          id: appAudios.id,
          captureId: appAudios.captureId,
          status: appAudios.status,
          segmentIndex: appAudios.segmentIndex,
        })
        .from(appAudios)
        .where(and(inArray(appAudios.captureId, captureIds), isNotNull(appAudios.segmentIndex)))
        .orderBy(asc(appAudios.segmentIndex), asc(appAudios.createdAt))
    : [];

  const segmentIds = segmentRows.map((row) => row.id);
  const segmentJobs = segmentIds.length
    ? await getLatestAudioPipelineJobsForAudios(segmentIds)
    : new Map();

  const segmentsByCapture = new Map<string, CaptureStatusSegment[]>();
  for (const row of segmentRows) {
    if (!row.captureId) continue;
    const list = segmentsByCapture.get(row.captureId) ?? [];
    const job = segmentJobs.get(row.id);
    list.push({
      status: row.status,
      pipeline_job: job ? { stage: job.stage } : null,
    });
    segmentsByCapture.set(row.captureId, list);
  }

  return {
    items: rows.map((row) => {
      const captureJob = jobs.get(row.id);
      const resolvedStatus = resolveCaptureStatusFromSegments(
        segmentsByCapture.get(row.id) ?? [],
        captureJob ? { stage: captureJob.stage } : null,
      );
      return toCapturePublic(
        { ...row, status: resolvedStatus },
        captureJob,
        countMap.get(row.id) ?? 0,
      );
    }),
    total: countRow?.count ?? 0,
  };
}

export async function getAudioCaptureById(id: string): Promise<CaptureRow | null> {
  const [row] = await db.select().from(appAudioCaptures).where(eq(appAudioCaptures.id, id)).limit(1);
  return row ?? null;
}

export async function getCapturePublicById(id: string) {
  const row = await getAudioCaptureById(id);
  if (!row) return null;

  const job = await getLatestCapturePipelineJob(id);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appAudios)
    .where(eq(appAudios.captureId, id));

  return toCapturePublic(row, job ?? undefined, countRow?.count ?? 0);
}

export async function getCaptureChannelMeta(
  id: string,
): Promise<{ channel_id: string } | null> {
  const row = await getAudioCaptureById(id);
  if (!row) return null;
  return { channel_id: row.channelId };
}

export async function getCaptureWithSegments(id: string, options?: { sync?: boolean }) {
  if (options?.sync !== false) {
    const { syncCaptureStatus } = await import('./capture-status.ts');
    await syncCaptureStatus(id);
  }

  const row = await getAudioCaptureById(id);
  if (!row) return null;

  const segments = await db
    .select()
    .from(appAudios)
    .where(eq(appAudios.captureId, id))
    .orderBy(asc(appAudios.segmentIndex), asc(appAudios.createdAt));

  const jobs = await getLatestAudioPipelineJobsForAudios(segments.map((s) => s.id));
  const captureJob = await getLatestCapturePipelineJob(id);
  const statusSegments: CaptureStatusSegment[] = segments.map((seg) => {
    const job = jobs.get(seg.id);
    return {
      status: seg.status,
      pipeline_job: job ? { stage: job.stage } : null,
    };
  });
  const resolvedStatus = resolveCaptureStatusFromSegments(
    statusSegments,
    captureJob ? { stage: captureJob.stage } : null,
  );

  const capture = toCapturePublic(
    { ...row, status: resolvedStatus },
    captureJob ?? undefined,
    segments.length,
  );

  return {
    ...capture,
    segments: segments.map((seg) => toSegmentPublic(seg, jobs.get(seg.id))),
  };
}

export async function updateAudioCapture(
  id: string,
  input: {
    title?: string;
    brief?: string | null;
    participantsHint?: string | null;
    recordingMode?: AudioCaptureRecordingMode | null;
    audience?: AudioCaptureAudience;
    metadata?: Record<string, unknown>;
  },
): Promise<ReturnType<typeof toCapturePublic> | null> {
  const [row] = await db
    .update(appAudioCaptures)
    .set({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.brief !== undefined ? { brief: input.brief?.trim() || null } : {}),
      ...(input.participantsHint !== undefined
        ? { participantsHint: input.participantsHint?.trim() || null }
        : {}),
      ...(input.recordingMode !== undefined ? { recordingMode: input.recordingMode } : {}),
      ...(input.audience !== undefined ? { audience: input.audience } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appAudioCaptures.id, id))
    .returning();

  if (!row) return null;
  return getCapturePublicById(row.id);
}

export async function deleteAudioCapture(id: string): Promise<boolean> {
  const result = await db.delete(appAudioCaptures).where(eq(appAudioCaptures.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function nextSegmentIndex(captureId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${appAudios.segmentIndex}), -1)::int` })
    .from(appAudios)
    .where(eq(appAudios.captureId, captureId));
  return (row?.max ?? -1) + 1;
}

export async function attachAudioToCapture(input: {
  captureId: string;
  audioId: string;
  segmentLabel?: string | null;
}): Promise<void> {
  const index = await nextSegmentIndex(input.captureId);
  await db
    .update(appAudios)
    .set({
      captureId: input.captureId,
      segmentIndex: index,
      segmentLabel: input.segmentLabel?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(appAudios.id, input.audioId));

  const { syncCaptureStatus } = await import('./capture-status.ts');
  await syncCaptureStatus(input.captureId);
}

export async function reorderCaptureSegments(
  captureId: string,
  orderedAudioIds: string[],
): Promise<void> {
  const segments = await db
    .select({ id: appAudios.id })
    .from(appAudios)
    .where(eq(appAudios.captureId, captureId));

  const existing = new Set(segments.map((s) => s.id));
  if (orderedAudioIds.length !== existing.size) {
    throw new Error('Segment order must include every segment exactly once');
  }
  for (const id of orderedAudioIds) {
    if (!existing.has(id)) throw new Error('Invalid segment id in order');
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedAudioIds.length; i += 1) {
      await tx
        .update(appAudios)
        .set({ segmentIndex: i, updatedAt: new Date() })
        .where(eq(appAudios.id, orderedAudioIds[i]!));
    }
    await tx
      .update(appAudioCaptures)
      .set({ updatedAt: new Date() })
      .where(eq(appAudioCaptures.id, captureId));
  });
}

export async function detachCaptureSegment(captureId: string, audioId: string): Promise<void> {
  const [seg] = await db
    .select()
    .from(appAudios)
    .where(and(eq(appAudios.id, audioId), eq(appAudios.captureId, captureId)))
    .limit(1);
  if (!seg) throw new Error('Segment not found in capture');

  await db
    .update(appAudios)
    .set({
      captureId: null,
      segmentIndex: null,
      segmentLabel: null,
      updatedAt: new Date(),
    })
    .where(eq(appAudios.id, audioId));
}
