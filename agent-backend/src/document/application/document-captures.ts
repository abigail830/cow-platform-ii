import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import {
  appDocumentCaptureSegments,
  appDocumentCaptures,
  appDocuments,
  db,
  type AudioCaptureAudience,
  type AudioCaptureRecordingMode,
  type DocumentCaptureInputMode,
} from '../../infrastructure/db/index.ts';
import {
  documentCapturePipelineJobToPublic,
  getLatestDocumentCapturePipelineJob,
  getLatestDocumentCapturePipelineJobsForCaptures,
} from './document-capture-pipeline-jobs.ts';
import {
  getLatestAudioPipelineJobsForDocumentCaptureSegments,
  audioPipelineJobToPublic,
} from '../../audio/application/audio-pipeline-jobs.ts';
import { getLatestPipelineJobsForSegments, pipelineJobToPublic } from '../../pipeline/application/pipeline-jobs.ts';
import { resolveCaptureStatusFromSegments } from '../domain/capture/capture-status-resolve.ts';
import {
  buildDocumentCaptureStatusSegments,
  syncDocumentCaptureStatus,
} from './document-capture-status.ts';

export type DocumentCaptureRow = typeof appDocumentCaptures.$inferSelect;

function resolveArtifactDocumentId(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  if (typeof metadata.library_document_id === 'string') return metadata.library_document_id;
  if (typeof metadata.legacy_document_id === 'string') return metadata.legacy_document_id;
  return null;
}

function toCapturePublic(
  row: DocumentCaptureRow,
  job?: Awaited<ReturnType<typeof getLatestDocumentCapturePipelineJob>>,
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
    pipeline_job: job ? documentCapturePipelineJobToPublic(job) : null,
  };
}

function toSegmentPublic(
  row: typeof appDocumentCaptureSegments.$inferSelect,
  inputMode: DocumentCaptureInputMode,
  audioJob?: Awaited<
    ReturnType<typeof getLatestAudioPipelineJobsForDocumentCaptureSegments>
  > extends Map<string, infer J>
    ? J
    : never,
  documentJob?: Awaited<ReturnType<typeof getLatestPipelineJobsForSegments>> extends Map<
    string,
    infer J
  >
    ? J
    : never,
) {
  const artifactDocumentId = resolveArtifactDocumentId(row.metadata as Record<string, unknown> | null);

  let pipelineJob = null;
  if (inputMode === 'document' && documentJob) {
    pipelineJob = pipelineJobToPublic(documentJob);
  } else if (audioJob) {
    pipelineJob = audioPipelineJobToPublic(audioJob);
  }

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
    metadata: {
      ...(row.metadata as Record<string, unknown>),
      ...(artifactDocumentId ? { library_document_id: artifactDocumentId } : {}),
    },
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pipeline_job: pipelineJob,
  };
}

export async function createDocumentCapture(input: {
  channelId: string;
  title: string;
  brief?: string | null;
  participantsHint?: string | null;
  recordingMode?: AudioCaptureRecordingMode | null;
  audience?: AudioCaptureAudience;
  inputMode?: DocumentCaptureInputMode;
  createdBy?: string | null;
}): Promise<ReturnType<typeof toCapturePublic>> {
  const [row] = await db
    .insert(appDocumentCaptures)
    .values({
      channelId: input.channelId,
      title: input.title.trim(),
      brief: input.brief?.trim() || null,
      participantsHint: input.participantsHint?.trim() || null,
      recordingMode: input.recordingMode ?? null,
      audience: input.audience ?? 'unknown',
      inputMode: input.inputMode ?? 'document',
      status: 'draft',
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return toCapturePublic(row!, undefined, 0);
}

export async function listDocumentCaptures(input: {
  channelId: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ReturnType<typeof toCapturePublic>[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const search = input.search?.trim();

  const conditions = [eq(appDocumentCaptures.channelId, input.channelId)];
  if (search) {
    conditions.push(ilike(appDocumentCaptures.title, `%${search}%`));
  }

  const where = and(...conditions);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appDocumentCaptures)
    .where(where);

  const rows = await db
    .select()
    .from(appDocumentCaptures)
    .where(where)
    .orderBy(desc(appDocumentCaptures.updatedAt))
    .limit(limit)
    .offset(offset);

  const captureIds = rows.map((r) => r.id);
  const jobs = await getLatestDocumentCapturePipelineJobsForCaptures(captureIds);

  const segmentCounts = captureIds.length
    ? await db
        .select({
          captureId: appDocumentCaptureSegments.captureId,
          count: sql<number>`count(*)::int`,
        })
        .from(appDocumentCaptureSegments)
        .where(inArray(appDocumentCaptureSegments.captureId, captureIds))
        .groupBy(appDocumentCaptureSegments.captureId)
    : [];

  const countMap = new Map(segmentCounts.map((r) => [r.captureId, r.count]));

  const segmentRows = captureIds.length
    ? await db
        .select()
        .from(appDocumentCaptureSegments)
        .where(inArray(appDocumentCaptureSegments.captureId, captureIds))
        .orderBy(asc(appDocumentCaptureSegments.segmentIndex), asc(appDocumentCaptureSegments.createdAt))
    : [];

  const segmentIds = segmentRows.map((row) => row.id);
  const audioJobs = segmentIds.length
    ? await getLatestAudioPipelineJobsForDocumentCaptureSegments(segmentIds)
    : new Map();

  const segmentsByCapture = new Map<string, typeof segmentRows>();
  for (const row of segmentRows) {
    const list = segmentsByCapture.get(row.captureId) ?? [];
    list.push(row);
    segmentsByCapture.set(row.captureId, list);
  }

  return {
    items: await Promise.all(
      rows.map(async (row) => {
        const captureJob = jobs.get(row.id);
        const captureSegments = segmentsByCapture.get(row.id) ?? [];
        const statusSegments = await buildDocumentCaptureStatusSegments(
          row.inputMode,
          captureSegments,
          audioJobs,
        );
        const resolvedStatus = resolveCaptureStatusFromSegments(
          statusSegments,
          captureJob ? { stage: captureJob.stage } : null,
        );
        return toCapturePublic(
          { ...row, status: resolvedStatus },
          captureJob,
          countMap.get(row.id) ?? 0,
        );
      }),
    ),
    total: countRow?.count ?? 0,
  };
}

export async function getDocumentCaptureById(id: string): Promise<DocumentCaptureRow | null> {
  const [row] = await db
    .select()
    .from(appDocumentCaptures)
    .where(eq(appDocumentCaptures.id, id))
    .limit(1);
  return row ?? null;
}

export async function getCapturePublicById(id: string) {
  const row = await getDocumentCaptureById(id);
  if (!row) return null;

  const job = await getLatestDocumentCapturePipelineJob(id);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.captureId, id));

  return toCapturePublic(row, job ?? undefined, countRow?.count ?? 0);
}

export async function getCaptureChannelMeta(
  id: string,
): Promise<{ channel_id: string } | null> {
  const row = await getDocumentCaptureById(id);
  if (!row) return null;
  return { channel_id: row.channelId };
}

export async function getCaptureWithSegments(id: string, options?: { sync?: boolean }) {
  if (options?.sync !== false) {
    await syncDocumentCaptureStatus(id);
  }

  const row = await getDocumentCaptureById(id);
  if (!row) return null;

  const segments = await db
    .select()
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.captureId, id))
    .orderBy(asc(appDocumentCaptureSegments.segmentIndex), asc(appDocumentCaptureSegments.createdAt));

  const audioJobs = await getLatestAudioPipelineJobsForDocumentCaptureSegments(
    segments.map((s) => s.id),
  );
  const documentSegmentJobs =
    row.inputMode === 'document'
      ? await getLatestPipelineJobsForSegments(segments.map((segment) => segment.id))
      : new Map();

  const captureJob = await getLatestDocumentCapturePipelineJob(id);
  const statusSegments = await buildDocumentCaptureStatusSegments(row.inputMode, segments, audioJobs);
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
    segments: segments.map((seg) =>
      toSegmentPublic(
        seg,
        row.inputMode,
        audioJobs.get(seg.id),
        row.inputMode === 'document' ? documentSegmentJobs.get(seg.id) : undefined,
      ),
    ),
  };
}

export async function updateDocumentCapture(
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
    .update(appDocumentCaptures)
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
    .where(eq(appDocumentCaptures.id, id))
    .returning();

  if (!row) return null;
  return getCapturePublicById(row.id);
}

export async function deleteDocumentCapture(id: string): Promise<boolean> {
  const segments = await db
    .select({ metadata: appDocumentCaptureSegments.metadata })
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.captureId, id));

  const artifactDocIds = segments
    .map((segment) => {
      const meta = segment.metadata as Record<string, unknown> | null;
      const libraryDocumentId =
        typeof meta?.library_document_id === 'string' ? meta.library_document_id : null;
      const legacyDocumentId =
        typeof meta?.legacy_document_id === 'string' ? meta.legacy_document_id : null;
      if (libraryDocumentId && !legacyDocumentId) return libraryDocumentId;
      return null;
    })
    .filter((docId): docId is string => Boolean(docId));

  if (artifactDocIds.length > 0) {
    await db.delete(appDocuments).where(inArray(appDocuments.id, artifactDocIds));
  }

  const result = await db.delete(appDocumentCaptures).where(eq(appDocumentCaptures.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function nextSegmentIndex(captureId: string): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${appDocumentCaptureSegments.segmentIndex}), -1)::int`,
    })
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.captureId, captureId));
  return (row?.max ?? -1) + 1;
}

export async function createDocumentCaptureSegment(input: {
  channelId: string;
  captureId: string;
  name: string;
  fileType: string;
  sizeBytes: number;
  fileHash: string;
  s3Key: string;
  uploadedBy?: string | null;
  segmentLabel?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}): Promise<typeof appDocumentCaptureSegments.$inferSelect> {
  const segmentIndex = await nextSegmentIndex(input.captureId);
  const [row] = await db
    .insert(appDocumentCaptureSegments)
    .values({
      channelId: input.channelId,
      captureId: input.captureId,
      segmentIndex,
      segmentLabel: input.segmentLabel?.trim() || null,
      name: input.name,
      fileType: input.fileType,
      sizeBytes: input.sizeBytes,
      fileHash: input.fileHash,
      s3Key: input.s3Key,
      status: input.status ?? 'uploaded',
      metadata: input.metadata ?? {},
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning();

  const { afterDocumentCaptureSegmentAttached } = await import('./document-capture-segment-pipeline.ts');
  await afterDocumentCaptureSegmentAttached(row!.id);
  return row!;
}

export async function attachSegmentToCapture(input: {
  captureId: string;
  segmentId: string;
  segmentLabel?: string | null;
}): Promise<void> {
  const index = await nextSegmentIndex(input.captureId);
  await db
    .update(appDocumentCaptureSegments)
    .set({
      captureId: input.captureId,
      segmentIndex: index,
      segmentLabel: input.segmentLabel?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(appDocumentCaptureSegments.id, input.segmentId));

  const { afterDocumentCaptureSegmentAttached } = await import('./document-capture-segment-pipeline.ts');
  await afterDocumentCaptureSegmentAttached(input.segmentId);
  await syncDocumentCaptureStatus(input.captureId);
}

export async function reorderCaptureSegments(
  captureId: string,
  orderedSegmentIds: string[],
): Promise<void> {
  const segments = await db
    .select({ id: appDocumentCaptureSegments.id })
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.captureId, captureId));

  const existing = new Set(segments.map((s) => s.id));
  if (orderedSegmentIds.length !== existing.size) {
    throw new Error('Segment order must include every segment exactly once');
  }
  for (const id of orderedSegmentIds) {
    if (!existing.has(id)) throw new Error('Invalid segment id in order');
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedSegmentIds.length; i += 1) {
      await tx
        .update(appDocumentCaptureSegments)
        .set({ segmentIndex: i, updatedAt: new Date() })
        .where(eq(appDocumentCaptureSegments.id, orderedSegmentIds[i]!));
    }
    await tx
      .update(appDocumentCaptures)
      .set({ updatedAt: new Date() })
      .where(eq(appDocumentCaptures.id, captureId));
  });
}

export async function detachCaptureSegment(captureId: string, segmentId: string): Promise<void> {
  const [seg] = await db
    .select()
    .from(appDocumentCaptureSegments)
    .where(
      and(
        eq(appDocumentCaptureSegments.id, segmentId),
        eq(appDocumentCaptureSegments.captureId, captureId),
      ),
    )
    .limit(1);
  if (!seg) throw new Error('Segment not found in capture');

  await db.delete(appDocumentCaptureSegments).where(eq(appDocumentCaptureSegments.id, segmentId));
  await syncDocumentCaptureStatus(captureId);
}
