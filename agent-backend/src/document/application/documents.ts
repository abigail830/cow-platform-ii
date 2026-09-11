import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  appDocumentCaptureSegments,
  appDocumentChannels,
  appDocumentCaptures,
  appDocuments,
  appPipelineJobs,
  appResourceGrants,
  db,
} from '../../infrastructure/db/index.ts';
import { getPipelineConfigById } from '../../pipeline/infrastructure/pipeline-config-store.ts';
import { getDefaultKnowledgeChannelPipelineIds } from '../domain/knowledge-channel-pipeline-defaults.ts';
import type { ChannelNode } from '../domain/channel-node.ts';
import { buildChannelTree, collectChannelSubtreeIds, collectDescendantIds } from '../domain/channel-tree.ts';
import {
  getLatestPipelineJobForDocument,
  getLatestPipelineJobsForDocuments,
  getLatestPipelineJobsForSegments,
  pipelineJobToPublic,
} from '../../pipeline/application/pipeline-jobs.ts';
import {
  audioPipelineJobToPublic,
  getLatestAudioPipelineJobsForDocumentCaptureSegments,
} from '../../audio/application/audio-pipeline-jobs.ts';
import {
  EVAL_SHADOW_DOCUMENT_CHANNEL_NAME,
} from '../../eval/application/eval-shadow-document.ts';

export type { ChannelNode } from '../domain/channel-node.ts';

export type ChannelRow = typeof appDocumentChannels.$inferSelect;
export type DocumentRow = typeof appDocuments.$inferSelect;

export type DocumentPipelineJobPublic = {
  id: string;
  stage: string;
  pipeline_name: string;
  error_message: string | null;
  external_job_id: string | null;
  updated_at: string;
};

function toChannelPublic(row: ChannelRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parent_id: row.parentId,
    sort_order: row.sortOrder,
    pipeline_id: row.pipelineId,
    transcription_pipeline_id: row.transcriptionPipelineId,
    post_process_pipeline_id: row.postProcessPipelineId,
    auto_start_pipeline: row.autoStartPipeline,
    asr_vocabulary_id: row.asrVocabularyId,
    asr_vocabulary_target_model: row.asrVocabularyTargetModel,
    asr_vocabulary_synced_at: row.asrVocabularySyncedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toDocumentPublic(
  row: DocumentRow,
  job?: typeof appPipelineJobs.$inferSelect | null,
) {
  return {
    id: row.id,
    channel_id: row.channelId,
    name: row.name,
    file_type: row.fileType,
    size_bytes: row.sizeBytes,
    file_hash: row.fileHash,
    s3_key: row.s3Key,
    status: row.status,
    metadata: row.metadata ?? {},
    uploaded_by: row.uploadedBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pipeline_job: job ? pipelineJobToPublic(job) : null,
  };
}

export async function listChannelTree(): Promise<ChannelNode[]> {
  const rows = await db
    .select()
    .from(appDocumentChannels)
    .where(sql`${appDocumentChannels.name} <> ${EVAL_SHADOW_DOCUMENT_CHANNEL_NAME}`)
    .orderBy(asc(appDocumentChannels.sortOrder), asc(appDocumentChannels.name));

  return buildChannelTree(rows.map(toChannelPublic));
}

export async function getChannelById(id: string): Promise<ChannelRow | null> {
  const [row] = await db.select().from(appDocumentChannels).where(eq(appDocumentChannels.id, id)).limit(1);
  return row ?? null;
}

export async function createChannel(input: {
  name: string;
  description?: string | null;
  parentId?: string | null;
  createdBy?: string | null;
}): Promise<ReturnType<typeof toChannelPublic>> {
  const name = input.name.trim();
  if (!name || name.length > 256) throw new Error('Channel name must be 1–256 characters');

  let parent: ChannelRow | null = null;
  if (input.parentId) {
    parent = await getChannelById(input.parentId);
    if (!parent) throw new Error('Parent channel not found');
  }

  const siblings = await db
    .select({ sortOrder: appDocumentChannels.sortOrder })
    .from(appDocumentChannels)
    .where(
      input.parentId
        ? eq(appDocumentChannels.parentId, input.parentId)
        : isNull(appDocumentChannels.parentId),
    );

  const maxSort = siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1);
  const defaults = await getDefaultKnowledgeChannelPipelineIds();

  const pipelineId = parent?.pipelineId ?? defaults.documentPipelineId;
  const transcriptionPipelineId = parent?.transcriptionPipelineId ?? defaults.transcriptionPipelineId;
  const postProcessPipelineId = parent?.postProcessPipelineId ?? defaults.postProcessPipelineId;

  const [row] = await db
    .insert(appDocumentChannels)
    .values({
      name,
      description: input.description?.trim() || null,
      parentId: input.parentId ?? null,
      sortOrder: maxSort + 1,
      pipelineId,
      transcriptionPipelineId,
      postProcessPipelineId,
      autoStartPipeline:
        pipelineId || transcriptionPipelineId ? (parent?.autoStartPipeline ?? false) : false,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return toChannelPublic(row!);
}

export async function updateChannel(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    parentId?: string | null;
    pipelineId?: string | null;
    transcriptionPipelineId?: string | null;
    postProcessPipelineId?: string | null;
    autoStartPipeline?: boolean;
  },
): Promise<ReturnType<typeof toChannelPublic>> {
  const existing = await getChannelById(id);
  if (!existing) throw new Error('Channel not found');

  if (input.pipelineId !== undefined && input.pipelineId !== null) {
    const pipeline = await getPipelineConfigById(input.pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');
    if (!pipeline.isEnabled) throw new Error('Pipeline is disabled');
    const { isDocumentAsyncPipelineName, ASYNC_PIPELINE_NAMES } = await import('../../pipeline/application/pipeline-jobs.ts');
    if (!isDocumentAsyncPipelineName(pipeline.pipelineName)) {
      throw new Error(
        `Channel document pipeline must be an async document parse pipeline ` +
          `(${[...ASYNC_PIPELINE_NAMES].join(', ')}). Got: ${pipeline.pipelineName}`,
      );
    }
  }

  if (input.transcriptionPipelineId !== undefined && input.transcriptionPipelineId !== null) {
    const pipeline = await getPipelineConfigById(input.transcriptionPipelineId);
    if (!pipeline) throw new Error('Transcription pipeline not found');
    if (!pipeline.isEnabled) throw new Error('Transcription pipeline is disabled');
    const { isAudioAsyncPipelineName, ASYNC_AUDIO_PIPELINE_NAMES } = await import('../../audio/domain/audio-pipeline-names.ts');
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
    const { isCapturePostProcessPipelineName, CAPTURE_POST_PROCESS_PIPELINE_NAMES } = await import(
      '../domain/capture/capture-post-process-pipeline-names.ts'
    );
    if (!isCapturePostProcessPipelineName(pipeline.pipelineName)) {
      throw new Error(
        `Channel post-process pipeline must be a capture post-process pipeline ` +
          `(${[...CAPTURE_POST_PROCESS_PIPELINE_NAMES].join(', ')}). Got: ${pipeline.pipelineName}`,
      );
    }
  }

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) throw new Error('Channel cannot be its own parent');
    const parent = await getChannelById(input.parentId);
    if (!parent) throw new Error('Parent channel not found');
    const allRows = await db
      .select({ id: appDocumentChannels.id, parentId: appDocumentChannels.parentId })
      .from(appDocumentChannels);
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

  const [row] = await db
    .update(appDocumentChannels)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.pipelineId !== undefined ? { pipelineId: input.pipelineId } : {}),
      ...(input.transcriptionPipelineId !== undefined
        ? { transcriptionPipelineId: input.transcriptionPipelineId }
        : {}),
      ...(input.postProcessPipelineId !== undefined
        ? { postProcessPipelineId: input.postProcessPipelineId }
        : {}),
      ...(input.autoStartPipeline !== undefined ? { autoStartPipeline: input.autoStartPipeline } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appDocumentChannels.id, id))
    .returning();

  if (input.transcriptionPipelineId !== undefined) {
    try {
      const { syncDocumentChannelAsrVocabularyIfPipelineChanged } = await import(
        '../../audio/application/asr-hotwords.ts'
      );
      await syncDocumentChannelAsrVocabularyIfPipelineChanged(
        id,
        existing.transcriptionPipelineId,
        input.transcriptionPipelineId,
      );
    } catch (error) {
      // Channel row is already saved; vocabulary sync runs again on hotword save or ASR job dispatch.
      console.warn(
        `[document-channels] ASR vocabulary sync skipped after pipeline update for ${id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return toChannelPublic(row!);
}

export async function deleteChannel(id: string): Promise<void> {
  const existing = await getChannelById(id);
  if (!existing) throw new Error('Channel not found');
  if (existing.name === EVAL_SHADOW_DOCUMENT_CHANNEL_NAME) {
    throw new Error('System evaluation channel cannot be deleted');
  }

  const channelRows = await db
    .select({ id: appDocumentChannels.id, parentId: appDocumentChannels.parentId })
    .from(appDocumentChannels);
  const channelIds = collectChannelSubtreeIds(
    id,
    channelRows.map((row) => ({ id: row.id, parent_id: row.parentId })),
  );

  const documents = await db
    .select({ id: appDocuments.id, fileHash: appDocuments.fileHash })
    .from(appDocuments)
    .where(
      and(
        inArray(appDocuments.channelId, channelIds),
        sql`coalesce(${appDocuments.metadata}->>'eval_shadow', 'false') <> 'true'`,
      ),
    );

  const { isStorageEnabled } = await import('../../infrastructure/oss/s3-config.ts');
  const { deleteDocumentStorage } = await import('../../document/infrastructure/document-files.ts');

  for (const doc of documents) {
    await db.delete(appDocuments).where(eq(appDocuments.id, doc.id));
    if (isStorageEnabled()) {
      try {
        await deleteDocumentStorage(doc.fileHash);
      } catch {
        // DB row is already removed; storage cleanup failure is non-fatal.
      }
    }
  }

  await db
    .delete(appResourceGrants)
    .where(
      and(
        eq(appResourceGrants.resourceType, 'document_channel'),
        inArray(appResourceGrants.resourceId, channelIds),
      ),
    );

  await db.delete(appDocumentChannels).where(inArray(appDocumentChannels.id, channelIds));
}

export async function listDocuments(input: {
  channelId: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<{ items: ReturnType<typeof toDocumentPublic>[]; total: number }> {
  const channel = await getChannelById(input.channelId);
  if (!channel) throw new Error('Channel not found');

  const offset = Math.max(input.offset ?? 0, 0);
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const search = input.search?.trim();

  const conditions = [
    eq(appDocuments.channelId, input.channelId),
    sql`coalesce(${appDocuments.metadata}->>'eval_shadow', 'false') <> 'true'`,
  ];
  if (search) {
    conditions.push(sql`${appDocuments.name} ILIKE ${`%${search}%`}`);
  }

  const whereClause = and(...conditions);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appDocuments)
    .where(whereClause);

  const rows = await db
    .select()
    .from(appDocuments)
    .where(whereClause)
    .orderBy(sql`${appDocuments.updatedAt} DESC`)
    .limit(limit)
    .offset(offset);

  const jobMap = await getLatestPipelineJobsForDocuments(rows.map((row) => row.id));

  return {
    items: rows.map((row) => toDocumentPublic(row, jobMap.get(row.id))),
    total: countRow?.count ?? 0,
  };
}

export type ChannelKnowledgeItem = {
  kind: 'capture';
  name: string;
  file_count: number;
  size_bytes: number;
  primary_segment_id: string | null;
  segment_status: string | null;
  segment_pipeline_job: DocumentPipelineJobPublic | null;
} & NonNullable<Awaited<ReturnType<typeof import('./document-captures.ts').getCapturePublicById>>>;

export async function listChannelKnowledgeItems(input: {
  channelId: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: NonNullable<ChannelKnowledgeItem>[]; total: number }> {
  const channel = await getChannelById(input.channelId);
  if (!channel) throw new Error('Channel not found');

  const search = input.search?.trim();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const captureConditions = [eq(appDocumentCaptures.channelId, input.channelId)];
  if (search) {
    captureConditions.push(sql`${appDocumentCaptures.title} ILIKE ${`%${search}%`}`);
  }

  const [captureCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appDocumentCaptures)
    .where(and(...captureConditions));

  const total = captureCountRow?.count ?? 0;

  const captureRows = await db
    .select()
    .from(appDocumentCaptures)
    .where(and(...captureConditions))
    .orderBy(desc(appDocumentCaptures.updatedAt))
    .limit(limit)
    .offset(offset);

  const captureIds = captureRows.map((row) => row.id);
  const { toCapturePublic } = await import('./document-captures.ts');
  const { getLatestDocumentCapturePipelineJobsForCaptures } = await import(
    './document-capture-pipeline-jobs.ts'
  );
  const { buildDocumentCaptureStatusSegments } = await import('./document-capture-status.ts');
  const { resolveCaptureStatusFromSegments } = await import(
    '../domain/capture/capture-status-resolve.ts'
  );
  const capturePostProcessJobs = captureIds.length
    ? await getLatestDocumentCapturePipelineJobsForCaptures(captureIds)
    : new Map();

  const captureStats = captureIds.length
    ? await db
        .select({
          captureId: appDocumentCaptureSegments.captureId,
          fileCount: sql<number>`count(*)::int`,
          sizeBytes: sql<number>`coalesce(sum(${appDocumentCaptureSegments.sizeBytes}), 0)::int`,
        })
        .from(appDocumentCaptureSegments)
        .where(inArray(appDocumentCaptureSegments.captureId, captureIds))
        .groupBy(appDocumentCaptureSegments.captureId)
    : [];
  const captureStatsMap = new Map(
    captureStats.map((row) => [row.captureId, { fileCount: row.fileCount, sizeBytes: row.sizeBytes }]),
  );

  const segmentRows = captureIds.length
    ? await db
        .select()
        .from(appDocumentCaptureSegments)
        .where(inArray(appDocumentCaptureSegments.captureId, captureIds))
        .orderBy(asc(appDocumentCaptureSegments.segmentIndex), asc(appDocumentCaptureSegments.createdAt))
    : [];
  const primarySegmentByCapture = new Map<string, (typeof segmentRows)[number]>();
  for (const segment of segmentRows) {
    if (!primarySegmentByCapture.has(segment.captureId)) {
      primarySegmentByCapture.set(segment.captureId, segment);
    }
  }
  const segmentsByCapture = new Map<string, (typeof segmentRows)[number][]>();
  for (const segment of segmentRows) {
    const list = segmentsByCapture.get(segment.captureId) ?? [];
    list.push(segment);
    segmentsByCapture.set(segment.captureId, list);
  }

  const allSegmentIds = segmentRows.map((segment) => segment.id);
  const documentSegmentJobs = await getLatestPipelineJobsForSegments(allSegmentIds);
  const audioSegmentJobs = await getLatestAudioPipelineJobsForDocumentCaptureSegments(allSegmentIds);

  const items: NonNullable<ChannelKnowledgeItem>[] = await Promise.all(
    captureRows.map(async (row) => {
      const captureSegments = segmentsByCapture.get(row.id) ?? [];
      const statusSegments = await buildDocumentCaptureStatusSegments(
        row.inputMode,
        captureSegments,
        audioSegmentJobs,
      );
      const captureJob = capturePostProcessJobs.get(row.id);
      const postProcessJob =
        row.inputMode === 'document' ? null : captureJob ? { stage: captureJob.stage } : null;
      const resolvedStatus = resolveCaptureStatusFromSegments(
        statusSegments,
        postProcessJob,
        row.inputMode,
      );
      const stats = captureStatsMap.get(row.id);
      const capture = toCapturePublic(
        { ...row, status: resolvedStatus },
        row.inputMode === 'document' ? undefined : captureJob,
        stats?.fileCount ?? captureSegments.length,
      );
      const primarySegment = primarySegmentByCapture.get(row.id) ?? null;
      let segmentPipelineJob: DocumentPipelineJobPublic | null = null;
      if (primarySegment) {
        if (row.inputMode === 'document') {
          const job = documentSegmentJobs.get(primarySegment.id);
          segmentPipelineJob = job ? pipelineJobToPublic(job) : null;
        } else if (row.inputMode === 'audio') {
          const job = audioSegmentJobs.get(primarySegment.id);
          segmentPipelineJob = job ? audioPipelineJobToPublic(job) : null;
        }
      }
      return {
        kind: 'capture' as const,
        name: capture.title,
        file_count: stats?.fileCount ?? capture.segment_count,
        size_bytes: stats?.sizeBytes ?? 0,
        primary_segment_id: primarySegment?.id ?? null,
        segment_status: primarySegment?.status ?? null,
        segment_pipeline_job: segmentPipelineJob,
        ...capture,
      };
    }),
  );

  return { items, total };
}

export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(appDocuments).where(eq(appDocuments.id, id)).limit(1);
  return row ?? null;
}

export async function getDocumentPublicById(id: string): Promise<ReturnType<typeof toDocumentPublic> | null> {
  const row = await getDocumentById(id);
  if (!row) return null;
  const job = await getLatestPipelineJobForDocument(id);
  return toDocumentPublic(row, job);
}

export async function createDocumentRecord(input: {
  channelId: string;
  name: string;
  fileType: string;
  sizeBytes: number;
  fileHash: string;
  s3Key: string;
  uploadedBy?: string | null;
}): Promise<ReturnType<typeof toDocumentPublic>> {
  const channel = await getChannelById(input.channelId);
  if (!channel) throw new Error('Channel not found');

  const [row] = await db
    .insert(appDocuments)
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

  return toDocumentPublic(row!);
}

export async function deleteDocument(id: string): Promise<DocumentRow> {
  const existing = await getDocumentById(id);
  if (!existing) throw new Error('Document not found');
  await db.delete(appDocuments).where(eq(appDocuments.id, id));
  return existing;
}

export async function moveDocument(
  id: string,
  channelId: string,
): Promise<ReturnType<typeof toDocumentPublic>> {
  const existing = await getDocumentById(id);
  if (!existing) throw new Error('Document not found');

  const channel = await getChannelById(channelId);
  if (!channel) throw new Error('Channel not found');

  if (existing.channelId === channelId) {
    return toDocumentPublic(existing);
  }

  const [row] = await db
    .update(appDocuments)
    .set({ channelId, updatedAt: new Date() })
    .where(eq(appDocuments.id, id))
    .returning();

  return toDocumentPublic(row!);
}

export async function updateDocumentMetadata(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ metadata: Record<string, unknown> }> {
  const existing = await getDocumentById(id);
  if (!existing) throw new Error('Document not found');

  const merged = { ...(existing.metadata ?? {}), ...patch };
  await db
    .update(appDocuments)
    .set({ metadata: merged, updatedAt: new Date() })
    .where(eq(appDocuments.id, id));

  return { metadata: merged };
}

export async function getDocumentStats(channelIds?: Set<string>): Promise<{ channels: number; documents: number }> {
  if (channelIds && channelIds.size === 0) {
    return { channels: 0, documents: 0 };
  }

  const channelCountQuery = channelIds
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(appDocumentChannels)
        .where(inArray(appDocumentChannels.id, [...channelIds]))
    : db.select({ count: sql<number>`count(*)::int` }).from(appDocumentChannels);

  const docCountQuery = channelIds
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(appDocuments)
        .where(inArray(appDocuments.channelId, [...channelIds]))
    : db.select({ count: sql<number>`count(*)::int` }).from(appDocuments);

  const [channelRow] = await channelCountQuery;
  const [docRow] = await docCountQuery;
  return {
    channels: channelRow?.count ?? 0,
    documents: docRow?.count ?? 0,
  };
}

export type DocumentContentSources = {
  markdown_url: string;
  page_index_url: string;
  parsing_result_url?: string;
};

export type DocumentContentManifest = {
  id: string;
  name: string;
  file_type: string;
  status: string;
  metadata: Record<string, unknown>;
  sources: DocumentContentSources;
};

export type DocumentContentResponse = {
  id: string;
  name: string;
  file_type: string;
  status: string;
  metadata: Record<string, unknown>;
  markdown: string | null;
  page_index: Record<string, unknown> | null;
  parsing_result: Record<string, unknown> | null;
  has_markdown: boolean;
  has_page_index: boolean;
};

/** Presigned URLs only — browser fetches OSS directly (avoids Vercel→OSS connectivity). */
export async function getDocumentContentManifest(id: string): Promise<DocumentContentManifest> {
  const doc = await getDocumentById(id);
  if (!doc) throw new Error('Document not found');

  const { storagePrefixFromS3Key } = await import('../../infrastructure/oss/storage-read.ts');
  const { getStorageReadUrl } = await import('../../document/infrastructure/document-files.ts');
  const prefix = storagePrefixFromS3Key(doc.s3Key);
  const needsParsingResult = doc.fileType.toUpperCase() === 'XMIND';

  const [markdownUrl, pageIndexUrl, parsingResultUrl] = await Promise.all([
    getStorageReadUrl(`${prefix}/markdown.md`),
    getStorageReadUrl(`${prefix}/page_index.json`),
    needsParsingResult ? getStorageReadUrl(`${prefix}/result.json`) : Promise.resolve(undefined),
  ]);

  return {
    id: doc.id,
    name: doc.name,
    file_type: doc.fileType,
    status: doc.status,
    metadata: doc.metadata ?? {},
    sources: {
      markdown_url: markdownUrl,
      page_index_url: pageIndexUrl,
      ...(parsingResultUrl ? { parsing_result_url: parsingResultUrl } : {}),
    },
  };
}
