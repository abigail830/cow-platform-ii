import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  appDocumentCaptureSegments,
  appDocumentCaptures,
  appDocuments,
  db,
} from '../../infrastructure/db/index.ts';
import { captureMarkdownS3Key } from '../../document/infrastructure/audio-capture-files.ts';
import { createDocumentRecord } from './documents.ts';
import {
  captureLibraryDocumentFileHash,
  captureLibrarySourceKind,
  resolveCaptureLibraryDocumentId,
  shouldShadowCaptureAsLibraryDocument,
} from '../domain/capture/capture-library-document.ts';

async function captureSegmentSizeBytes(captureId: string): Promise<number> {
  const [row] = await db
    .select({
      sizeBytes: sql<number>`coalesce(sum(${appDocumentCaptureSegments.sizeBytes}), 0)::int`,
    })
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.captureId, captureId));
  return row?.sizeBytes ?? 0;
}

/**
 * After audio/transcript post-process writes captures/{id}/markdown.md,
 * upsert one library app_documents row for RAG import (1 capture → 1 md).
 */
export async function ensureCaptureLibraryDocument(captureId: string): Promise<string | null> {
  const [capture] = await db
    .select()
    .from(appDocumentCaptures)
    .where(eq(appDocumentCaptures.id, captureId))
    .limit(1);
  if (!capture) throw new Error('Capture not found');
  if (!shouldShadowCaptureAsLibraryDocument(capture.inputMode)) return null;

  const sourceKind = captureLibrarySourceKind(capture.inputMode);
  if (!sourceKind) return null;

  const metadata = (capture.metadata as Record<string, unknown>) ?? {};
  const existingId = resolveCaptureLibraryDocumentId(metadata);
  const s3Key = captureMarkdownS3Key(capture.id);
  const knowledgeMetadata = {
    knowledge_capture_id: capture.id,
    knowledge_archived: true,
    source_kind: sourceKind,
  };
  const now = new Date();

  if (existingId) {
    const [existing] = await db
      .select({ id: appDocuments.id, metadata: appDocuments.metadata })
      .from(appDocuments)
      .where(eq(appDocuments.id, existingId))
      .limit(1);
    if (existing) {
      await db
        .update(appDocuments)
        .set({
          name: capture.title,
          channelId: capture.channelId,
          fileType: 'MD',
          s3Key,
          status: 'done',
          metadata: {
            ...(existing.metadata ?? {}),
            ...knowledgeMetadata,
          },
          updatedAt: now,
        })
        .where(eq(appDocuments.id, existing.id));
      return existing.id;
    }
  }

  const document = await createDocumentRecord({
    channelId: capture.channelId,
    name: capture.title,
    fileType: 'MD',
    sizeBytes: await captureSegmentSizeBytes(capture.id),
    fileHash: captureLibraryDocumentFileHash(capture.id),
    s3Key,
  });

  await db
    .update(appDocuments)
    .set({
      status: 'done',
      metadata: knowledgeMetadata,
      updatedAt: now,
    })
    .where(eq(appDocuments.id, document.id));

  await db
    .update(appDocumentCaptures)
    .set({
      metadata: {
        ...metadata,
        library_document_id: document.id,
      },
      updatedAt: now,
    })
    .where(eq(appDocumentCaptures.id, capture.id));

  return document.id;
}

/** Idempotent backfill for captures that finished post-process before library shadowing existed. */
export async function reconcileDoneCaptureLibraryDocuments(channelIds?: string[]): Promise<void> {
  const conditions = [
    inArray(appDocumentCaptures.inputMode, ['audio', 'transcript']),
    eq(appDocumentCaptures.status, 'done'),
    sql`coalesce(${appDocumentCaptures.metadata}->>'library_document_id', '') = ''`,
  ];
  if (channelIds && channelIds.length > 0) {
    conditions.push(inArray(appDocumentCaptures.channelId, channelIds));
  }

  const rows = await db
    .select({ id: appDocumentCaptures.id })
    .from(appDocumentCaptures)
    .where(and(...conditions));

  for (const row of rows) {
    try {
      await ensureCaptureLibraryDocument(row.id);
    } catch (error) {
      console.error(
        `[document-capture] failed to backfill library document for ${row.id}:`,
        error,
      );
    }
  }
}
