import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  appAsrHotwordChannels,
  appAsrHotwordDocumentChannels,
  appAudioCapturePipelineJobs,
  appAudioCaptures,
  appAudios,
  appDocumentCapturePipelineJobs,
  appDocumentCaptureSegments,
  appDocumentCaptures,
  appDocumentChannels,
  appDocuments,
  appAudioChannels,
  appAudioPipelineJobs,
  appPipelineJobs,
  db,
} from '../../db/index.ts';
import { buildChannelPath } from '../channels/channel-tree.ts';
import { EVAL_SHADOW_DOCUMENT_CHANNEL_NAME } from '../eval/eval-shadow-document.ts';

export type KnowledgeCaptureMigrationStats = {
  documentChannelsMapped: number;
  documentChannelsCreated: number;
  legacyDocumentsMigrated: number;
  shadowDocumentsLinked: number;
  audioCapturesMigrated: number;
  audioSegmentsMigrated: number;
  standaloneAudiosMigrated: number;
  documentPipelineJobsRelinked: number;
  audioPipelineJobsRelinked: number;
  postProcessJobsMigrated: number;
  hotwordLinksCopied: number;
};

type ChannelRow = { id: string; name: string; parent_id: string | null };

function isLegacyKnowledgeDocument(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return true;
  if (metadata.knowledge_shadow === true) return false;
  if (metadata.eval_shadow === true) return false;
  if (metadata.knowledge_archived === true) return false;
  if (typeof metadata.knowledge_capture_id === 'string') return false;
  return true;
}

function mapDocumentStatusToCapture(status: string): string {
  if (status === 'completed') return 'done';
  if (status === 'running') return 'running';
  if (status === 'failed') return 'failed';
  return 'draft';
}

function mapDocumentStatusToSegment(status: string): string {
  if (status === 'completed') return 'completed';
  if (status === 'running') return 'running';
  if (status === 'failed') return 'failed';
  return 'uploaded';
}

function buildPathIndex(rows: ChannelRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(buildChannelPath(row.id, rows), row.id);
  }
  return map;
}

async function loadDocumentChannelRows(): Promise<ChannelRow[]> {
  const rows = await db
    .select({
      id: appDocumentChannels.id,
      name: appDocumentChannels.name,
      parentId: appDocumentChannels.parentId,
    })
    .from(appDocumentChannels)
    .where(sql`${appDocumentChannels.name} <> ${EVAL_SHADOW_DOCUMENT_CHANNEL_NAME}`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parent_id: row.parentId,
  }));
}

async function loadAudioChannelRows(): Promise<
  Array<ChannelRow & { sortOrder: number; description: string | null; pipelineId: string | null; postProcessPipelineId: string | null; autoStartPipeline: boolean; asrVocabularyId: string | null; asrVocabularyTargetModel: string | null; asrVocabularySyncedAt: Date | null; createdBy: string | null }>
> {
  const rows = await db.select().from(appAudioChannels).orderBy(appAudioChannels.sortOrder);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parent_id: row.parentId,
    sortOrder: row.sortOrder,
    description: row.description,
    pipelineId: row.pipelineId,
    postProcessPipelineId: row.postProcessPipelineId,
    autoStartPipeline: row.autoStartPipeline,
    asrVocabularyId: row.asrVocabularyId,
    asrVocabularyTargetModel: row.asrVocabularyTargetModel,
    asrVocabularySyncedAt: row.asrVocabularySyncedAt,
    createdBy: row.createdBy,
  }));
}

type AudioChannelRow = Awaited<ReturnType<typeof loadAudioChannelRows>>[number];

function sortAudioChannelsParentsFirst(rows: AudioChannelRow[]): AudioChannelRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const depthCache = new Map<string, number>();

  function depth(id: string): number {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const row = byId.get(id);
    if (!row?.parent_id) {
      depthCache.set(id, 0);
      return 0;
    }
    const value = 1 + depth(row.parent_id);
    depthCache.set(id, value);
    return value;
  }

  return [...rows].sort((a, b) => depth(a.id) - depth(b.id) || a.sortOrder - b.sortOrder);
}

/** Map audio channel id → document channel id (match by path or create). */
async function mapAudioChannelsToDocumentChannels(
  audioChannels: AudioChannelRow[],
  audioRows: ChannelRow[],
  docRows: ChannelRow[],
  docPathIndex: Map<string, string>,
  stats: KnowledgeCaptureMigrationStats,
  dryRun: boolean,
): Promise<Map<string, string>> {
  const audioToDocument = new Map<string, string>();

  for (const audioChannel of sortAudioChannelsParentsFirst(audioChannels)) {
    const path = buildChannelPath(audioChannel.id, audioRows);
    const existing = docPathIndex.get(path);
    if (existing) {
      audioToDocument.set(audioChannel.id, existing);
      stats.documentChannelsMapped += 1;
      continue;
    }

    const parentDocumentChannelId = audioChannel.parent_id
      ? audioToDocument.get(audioChannel.parent_id) ?? null
      : null;

    if (dryRun) {
      const placeholder = `dry-run-doc-channel-${audioChannel.id}`;
      audioToDocument.set(audioChannel.id, placeholder);
      stats.documentChannelsCreated += 1;
      continue;
    }

    const [created] = await db
      .insert(appDocumentChannels)
      .values({
        name: audioChannel.name,
        description: audioChannel.description,
        parentId: parentDocumentChannelId,
        sortOrder: audioChannel.sortOrder,
        transcriptionPipelineId: audioChannel.pipelineId,
        postProcessPipelineId: audioChannel.postProcessPipelineId,
        autoStartPipeline: audioChannel.autoStartPipeline,
        asrVocabularyId: audioChannel.asrVocabularyId,
        asrVocabularyTargetModel: audioChannel.asrVocabularyTargetModel,
        asrVocabularySyncedAt: audioChannel.asrVocabularySyncedAt,
        createdBy: audioChannel.createdBy,
      })
      .returning({ id: appDocumentChannels.id });

    docRows.push({ id: created!.id, name: audioChannel.name, parent_id: parentDocumentChannelId });
    docPathIndex.set(buildChannelPath(created!.id, docRows), created!.id);
    audioToDocument.set(audioChannel.id, created!.id);
    stats.documentChannelsCreated += 1;
  }

  return audioToDocument;
}

export async function migrateKnowledgeToCaptures(options?: {
  dryRun?: boolean;
}): Promise<KnowledgeCaptureMigrationStats> {
  const dryRun = options?.dryRun ?? false;
  const stats: KnowledgeCaptureMigrationStats = {
    documentChannelsMapped: 0,
    documentChannelsCreated: 0,
    legacyDocumentsMigrated: 0,
    shadowDocumentsLinked: 0,
    audioCapturesMigrated: 0,
    audioSegmentsMigrated: 0,
    standaloneAudiosMigrated: 0,
    documentPipelineJobsRelinked: 0,
    audioPipelineJobsRelinked: 0,
    postProcessJobsMigrated: 0,
    hotwordLinksCopied: 0,
  };

  const docRows = await loadDocumentChannelRows();
  const docPathIndex = buildPathIndex(docRows);
  const audioRows = await loadAudioChannelRows();
  const audioChannels = await loadAudioChannelRows();

  const audioToDocumentChannel = await mapAudioChannelsToDocumentChannels(
    audioChannels,
    audioRows,
    docRows,
    docPathIndex,
    stats,
    dryRun,
  );

  // Legacy standalone documents → document captures (1 file = 1 capture).
  const legacyDocs = await db.select().from(appDocuments);
  for (const doc of legacyDocs) {
    const meta = (doc.metadata as Record<string, unknown> | null) ?? {};
    if (!isLegacyKnowledgeDocument(meta)) continue;

    const captureStatus = mapDocumentStatusToCapture(doc.status);
    const segmentStatus = mapDocumentStatusToSegment(doc.status);

    if (dryRun) {
      stats.legacyDocumentsMigrated += 1;
      continue;
    }

    const [capture] = await db
      .insert(appDocumentCaptures)
      .values({
        channelId: doc.channelId,
        title: doc.name,
        inputMode: 'document',
        status: captureStatus,
        metadata: {
          migrated_from_document_id: doc.id,
          migrated_at: new Date().toISOString(),
        },
        createdBy: doc.uploadedBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      })
      .returning();

    const [segment] = await db
      .insert(appDocumentCaptureSegments)
      .values({
        channelId: doc.channelId,
        captureId: capture!.id,
        segmentIndex: 0,
        name: doc.name,
        fileType: doc.fileType,
        sizeBytes: doc.sizeBytes,
        fileHash: doc.fileHash,
        s3Key: doc.s3Key,
        status: segmentStatus,
        metadata: { legacy_document_id: doc.id },
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      })
      .returning();

    await db
      .update(appDocuments)
      .set({
        metadata: {
          ...meta,
          knowledge_archived: true,
          knowledge_capture_id: capture!.id,
          knowledge_capture_segment_id: segment!.id,
        },
        updatedAt: new Date(),
      })
      .where(eq(appDocuments.id, doc.id));

    const jobs = await db
      .select({ id: appPipelineJobs.id })
      .from(appPipelineJobs)
      .where(and(eq(appPipelineJobs.documentId, doc.id), isNull(appPipelineJobs.evalRunItemId)));

    if (jobs.length > 0) {
      await db
        .update(appPipelineJobs)
        .set({ documentCaptureSegmentId: segment!.id, updatedAt: new Date() })
        .where(inArray(appPipelineJobs.id, jobs.map((job) => job.id)));
      stats.documentPipelineJobsRelinked += jobs.length;
    }

    stats.legacyDocumentsMigrated += 1;
  }

  // Shadow documents from post-0078 uploads — link jobs to existing segments.
  const shadowDocs = await db.select().from(appDocuments).where(
    sql`coalesce(${appDocuments.metadata}->>'knowledge_shadow', 'false') = 'true'`,
  );
  for (const doc of shadowDocs) {
    const meta = (doc.metadata as Record<string, unknown> | null) ?? {};
    const segmentId =
      typeof meta.knowledge_capture_segment_id === 'string' ? meta.knowledge_capture_segment_id : null;
    if (!segmentId) continue;

    if (dryRun) {
      stats.shadowDocumentsLinked += 1;
      continue;
    }

    await db
      .update(appDocumentCaptureSegments)
      .set({
        metadata: sql`coalesce(${appDocumentCaptureSegments.metadata}, '{}'::jsonb) || ${JSON.stringify({ legacy_document_id: doc.id })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(appDocumentCaptureSegments.id, segmentId));

    const jobs = await db
      .select({ id: appPipelineJobs.id })
      .from(appPipelineJobs)
      .where(and(eq(appPipelineJobs.documentId, doc.id), isNull(appPipelineJobs.evalRunItemId)));

    if (jobs.length > 0) {
      await db
        .update(appPipelineJobs)
        .set({ documentCaptureSegmentId: segmentId, updatedAt: new Date() })
        .where(inArray(appPipelineJobs.id, jobs.map((job) => job.id)));
      stats.documentPipelineJobsRelinked += jobs.length;
    }

    await db
      .update(appDocuments)
      .set({
        metadata: {
          ...meta,
          knowledge_archived: true,
        },
        updatedAt: new Date(),
      })
      .where(eq(appDocuments.id, doc.id));

    stats.shadowDocumentsLinked += 1;
  }

  // Audio captures → document captures (preserve capture id for OSS post-process artifacts).
  const audioCaptures = await db.select().from(appAudioCaptures);
  for (const capture of audioCaptures) {
    const docChannelId = audioToDocumentChannel.get(capture.channelId);
    if (!docChannelId || docChannelId.startsWith('dry-run-')) {
      if (dryRun) stats.audioCapturesMigrated += 1;
      continue;
    }

    const existing = await db
      .select({ id: appDocumentCaptures.id })
      .from(appDocumentCaptures)
      .where(eq(appDocumentCaptures.id, capture.id))
      .limit(1);
    if (existing.length > 0) continue;

    if (dryRun) {
      stats.audioCapturesMigrated += 1;
      continue;
    }

    await db.insert(appDocumentCaptures).values({
      id: capture.id,
      channelId: docChannelId,
      title: capture.title,
      brief: capture.brief,
      participantsHint: capture.participantsHint,
      recordingMode: capture.recordingMode,
      audience: capture.audience,
      inputMode: capture.inputMode,
      status: capture.status,
      metadata: {
        ...(capture.metadata as Record<string, unknown>),
        migrated_from_audio_capture_id: capture.id,
        migrated_at: new Date().toISOString(),
      },
      createdBy: capture.createdBy,
      createdAt: capture.createdAt,
      updatedAt: capture.updatedAt,
    });
    stats.audioCapturesMigrated += 1;
  }

  const allAudios = await db.select().from(appAudios);
  for (const audio of allAudios) {
    if (!audio.captureId) continue;

    const docChannelId = audioToDocumentChannel.get(audio.channelId);
    if (!docChannelId || docChannelId.startsWith('dry-run-')) {
      if (dryRun) stats.audioSegmentsMigrated += 1;
      continue;
    }

    const docCaptureExists = await db
      .select({ id: appDocumentCaptures.id })
      .from(appDocumentCaptures)
      .where(eq(appDocumentCaptures.id, audio.captureId))
      .limit(1);
    if (docCaptureExists.length === 0) continue;

    const existingSegment = await db
      .select({ id: appDocumentCaptureSegments.id })
      .from(appDocumentCaptureSegments)
      .where(eq(appDocumentCaptureSegments.id, audio.id))
      .limit(1);
    if (existingSegment.length > 0) continue;

    if (dryRun) {
      stats.audioSegmentsMigrated += 1;
      continue;
    }

    await db.insert(appDocumentCaptureSegments).values({
      id: audio.id,
      channelId: docChannelId,
      captureId: audio.captureId,
      segmentIndex: audio.segmentIndex ?? 0,
      segmentLabel: audio.segmentLabel,
      name: audio.name,
      fileType: audio.fileType,
      sizeBytes: audio.sizeBytes,
      fileHash: audio.fileHash,
      s3Key: audio.s3Key,
      status: audio.status,
      durationSec: audio.durationSec,
      metadata: {
        ...(audio.metadata as Record<string, unknown>),
        migrated_from_audio_id: audio.id,
      },
      uploadedBy: audio.uploadedBy,
      createdAt: audio.createdAt,
      updatedAt: audio.updatedAt,
    });

    const audioJobs = await db
      .select({ id: appAudioPipelineJobs.id })
      .from(appAudioPipelineJobs)
      .where(and(eq(appAudioPipelineJobs.audioId, audio.id), isNull(appAudioPipelineJobs.evalRunItemId)));

    if (audioJobs.length > 0) {
      await db
        .update(appAudioPipelineJobs)
        .set({
          documentCaptureSegmentId: audio.id,
          updatedAt: new Date(),
        })
        .where(inArray(appAudioPipelineJobs.id, audioJobs.map((job) => job.id)));
      stats.audioPipelineJobsRelinked += audioJobs.length;
    }

    stats.audioSegmentsMigrated += 1;
  }

  // Standalone library audios → single-segment captures.
  for (const audio of allAudios.filter((row) => !row.captureId)) {
    const meta = (audio.metadata as Record<string, unknown> | null) ?? {};
    if (meta.eval_shadow === true) continue;

    const docChannelId = audioToDocumentChannel.get(audio.channelId) ?? audio.channelId;

    const existingCapture = await db
      .select({ id: appDocumentCaptures.id })
      .from(appDocumentCaptures)
      .where(sql`${appDocumentCaptures.metadata}->>'migrated_from_audio_id' = ${audio.id}`)
      .limit(1);
    if (existingCapture.length > 0) continue;

    if (dryRun) {
      stats.standaloneAudiosMigrated += 1;
      continue;
    }

    const [capture] = await db
      .insert(appDocumentCaptures)
      .values({
        channelId: docChannelId,
        title: audio.name,
        inputMode: 'audio',
        status: audio.status === 'completed' ? 'done' : audio.status === 'running' ? 'running' : 'draft',
        metadata: { migrated_from_audio_id: audio.id },
        createdBy: audio.uploadedBy,
        createdAt: audio.createdAt,
        updatedAt: audio.updatedAt,
      })
      .returning();

    await db.insert(appDocumentCaptureSegments).values({
      id: audio.id,
      channelId: docChannelId,
      captureId: capture!.id,
      segmentIndex: 0,
      name: audio.name,
      fileType: audio.fileType,
      sizeBytes: audio.sizeBytes,
      fileHash: audio.fileHash,
      s3Key: audio.s3Key,
      status: audio.status,
      durationSec: audio.durationSec,
      metadata: { migrated_from_audio_id: audio.id },
      uploadedBy: audio.uploadedBy,
      createdAt: audio.createdAt,
      updatedAt: audio.updatedAt,
    });

    const audioJobs = await db
      .select({ id: appAudioPipelineJobs.id })
      .from(appAudioPipelineJobs)
      .where(and(eq(appAudioPipelineJobs.audioId, audio.id), isNull(appAudioPipelineJobs.evalRunItemId)));

    if (audioJobs.length > 0) {
      await db
        .update(appAudioPipelineJobs)
        .set({ documentCaptureSegmentId: audio.id, updatedAt: new Date() })
        .where(inArray(appAudioPipelineJobs.id, audioJobs.map((job) => job.id)));
      stats.audioPipelineJobsRelinked += audioJobs.length;
    }

    stats.standaloneAudiosMigrated += 1;
  }

  // Post-process jobs (preserve job id + capture id for OSS artifacts).
  const audioPostJobs = await db.select().from(appAudioCapturePipelineJobs);
  for (const job of audioPostJobs) {
    const exists = await db
      .select({ id: appDocumentCapturePipelineJobs.id })
      .from(appDocumentCapturePipelineJobs)
      .where(eq(appDocumentCapturePipelineJobs.id, job.id))
      .limit(1);
    if (exists.length > 0) continue;

    const captureExists = await db
      .select({ id: appDocumentCaptures.id })
      .from(appDocumentCaptures)
      .where(eq(appDocumentCaptures.id, job.captureId))
      .limit(1);
    if (captureExists.length === 0) continue;

    if (dryRun) {
      stats.postProcessJobsMigrated += 1;
      continue;
    }

    await db.insert(appDocumentCapturePipelineJobs).values({
      id: job.id,
      captureId: job.captureId,
      pipelineName: job.pipelineName,
      stage: job.stage,
      configYaml: job.configYaml,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
    stats.postProcessJobsMigrated += 1;
  }

  // Copy ASR hotword channel links audio → document (skip duplicates).
  if (!dryRun) {
    const hotwordLinks = await db.select().from(appAsrHotwordChannels);
    for (const link of hotwordLinks) {
      const docChannelId = audioToDocumentChannel.get(link.channelId);
      if (!docChannelId || docChannelId.startsWith('dry-run-')) continue;

      const exists = await db
        .select({ hotwordId: appAsrHotwordDocumentChannels.hotwordId })
        .from(appAsrHotwordDocumentChannels)
        .where(
          and(
            eq(appAsrHotwordDocumentChannels.hotwordId, link.hotwordId),
            eq(appAsrHotwordDocumentChannels.channelId, docChannelId),
          ),
        )
        .limit(1);
      if (exists.length > 0) continue;

      await db.insert(appAsrHotwordDocumentChannels).values({
        hotwordId: link.hotwordId,
        channelId: docChannelId,
      });
      stats.hotwordLinksCopied += 1;
    }
  }

  return stats;
}
