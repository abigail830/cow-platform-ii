import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { appSessionFiles, db } from '../../db/index.ts';
import type { SessionFileRecord } from './types.ts';

function toRecord(row: typeof appSessionFiles.$inferSelect): SessionFileRecord {
  return {
    id: row.id,
    instanceId: row.instanceId,
    agentName: row.agentName,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageBackend: row.storageBackend as SessionFileRecord['storageBackend'],
    storageKey: row.storageKey,
    contentCacheKey: row.contentCacheKey,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export async function countSessionFilesForInstance(instanceId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appSessionFiles)
    .where(eq(appSessionFiles.instanceId, instanceId));
  return row?.count ?? 0;
}

export async function insertSessionFile(record: SessionFileRecord): Promise<void> {
  await db.insert(appSessionFiles).values({
    id: record.id,
    instanceId: record.instanceId,
    agentName: record.agentName,
    filename: record.filename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    storageBackend: record.storageBackend,
    storageKey: record.storageKey,
    contentCacheKey: record.contentCacheKey,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  });
}

export async function listSessionFilesForInstance(instanceId: string): Promise<SessionFileRecord[]> {
  const rows = await db
    .select()
    .from(appSessionFiles)
    .where(eq(appSessionFiles.instanceId, instanceId))
    .orderBy(asc(appSessionFiles.createdAt));
  return rows.map(toRecord);
}

export async function getSessionFile(
  instanceId: string,
  fileId: string,
): Promise<SessionFileRecord | null> {
  const [row] = await db
    .select()
    .from(appSessionFiles)
    .where(and(eq(appSessionFiles.instanceId, instanceId), eq(appSessionFiles.id, fileId)))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function deleteSessionFileRecord(instanceId: string, fileId: string): Promise<boolean> {
  const deleted = await db
    .delete(appSessionFiles)
    .where(and(eq(appSessionFiles.instanceId, instanceId), eq(appSessionFiles.id, fileId)))
    .returning({ id: appSessionFiles.id });
  return deleted.length > 0;
}

export async function setSessionFileContentCacheKey(
  instanceId: string,
  fileId: string,
  contentCacheKey: string,
): Promise<void> {
  await db
    .update(appSessionFiles)
    .set({ contentCacheKey })
    .where(and(eq(appSessionFiles.instanceId, instanceId), eq(appSessionFiles.id, fileId)));
}

export async function listExpiredSessionFileIds(before: Date): Promise<
  Array<{ instanceId: string; fileId: string }>
> {
  const rows = await db
    .select({ instanceId: appSessionFiles.instanceId, fileId: appSessionFiles.id })
    .from(appSessionFiles)
    .where(lt(appSessionFiles.expiresAt, before));
  return rows;
}

export async function deleteSessionFileRecordsByIds(
  instanceId: string,
  fileIds: string[],
): Promise<void> {
  if (fileIds.length === 0) return;
  for (const fileId of fileIds) {
    await deleteSessionFileRecord(instanceId, fileId);
  }
}
