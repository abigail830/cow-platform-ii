import { eq, inArray } from 'drizzle-orm';
import {
  appDocumentChannels,
  appKbFolderSyncChannels,
  appKbFolderSyncs,
  db,
} from '../../../infrastructure/db/index.ts';
import { clampSyncIntervalMinutes } from '../../domain/folder-sync-match.ts';

export type KbFolderSyncConfigRow = typeof appKbFolderSyncs.$inferSelect;

export type KbFolderSyncPublic = {
  knowledge_base_id: string;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  include_subfolders: boolean;
  channel_ids: string[];
  last_auto_sync_at: string | null;
};

async function listChannelIdsForSync(syncId: string): Promise<string[]> {
  const rows = await db
    .select({ channelId: appKbFolderSyncChannels.channelId })
    .from(appKbFolderSyncChannels)
    .where(eq(appKbFolderSyncChannels.syncId, syncId));
  return rows.map((r) => r.channelId);
}

export function toFolderSyncPublic(
  row: KbFolderSyncConfigRow,
  channelIds: string[],
): KbFolderSyncPublic {
  return {
    knowledge_base_id: row.knowledgeBaseId,
    auto_sync_enabled: row.autoSyncEnabled,
    sync_interval_minutes: row.syncIntervalMinutes,
    include_subfolders: row.includeSubfolders,
    channel_ids: channelIds,
    last_auto_sync_at: row.lastAutoSyncAt?.toISOString() ?? null,
  };
}

export async function getFolderSyncByKnowledgeBaseId(
  knowledgeBaseId: string,
): Promise<{ row: KbFolderSyncConfigRow; channelIds: string[] } | null> {
  const [row] = await db
    .select()
    .from(appKbFolderSyncs)
    .where(eq(appKbFolderSyncs.knowledgeBaseId, knowledgeBaseId))
    .limit(1);
  if (!row) return null;
  const channelIds = await listChannelIdsForSync(row.id);
  return { row, channelIds };
}

export async function getOrCreateFolderSyncConfig(
  knowledgeBaseId: string,
  createdBy?: string | null,
): Promise<{ row: KbFolderSyncConfigRow; channelIds: string[] }> {
  const existing = await getFolderSyncByKnowledgeBaseId(knowledgeBaseId);
  if (existing) return existing;

  const [row] = await db
    .insert(appKbFolderSyncs)
    .values({
      knowledgeBaseId,
      createdBy: createdBy ?? null,
    })
    .returning();
  return { row: row!, channelIds: [] };
}

export async function upsertFolderSyncConfig(input: {
  knowledgeBaseId: string;
  autoSyncEnabled?: boolean;
  syncIntervalMinutes?: number;
  includeSubfolders?: boolean;
  channelIds?: string[];
  createdBy?: string | null;
}): Promise<KbFolderSyncPublic> {
  const { row } = await getOrCreateFolderSyncConfig(input.knowledgeBaseId, input.createdBy);
  const now = new Date();

  const [updated] = await db
    .update(appKbFolderSyncs)
    .set({
      ...(input.autoSyncEnabled !== undefined
        ? { autoSyncEnabled: input.autoSyncEnabled }
        : {}),
      ...(input.syncIntervalMinutes !== undefined
        ? { syncIntervalMinutes: clampSyncIntervalMinutes(input.syncIntervalMinutes) }
        : {}),
      ...(input.includeSubfolders !== undefined
        ? { includeSubfolders: input.includeSubfolders }
        : {}),
      updatedAt: now,
    })
    .where(eq(appKbFolderSyncs.id, row.id))
    .returning();

  let channelIds = await listChannelIdsForSync(row.id);
  if (input.channelIds !== undefined) {
    const unique = [...new Set(input.channelIds.map((id) => id.trim()).filter(Boolean))];
    if (unique.length > 0) {
      const found = await db
        .select({ id: appDocumentChannels.id })
        .from(appDocumentChannels)
        .where(inArray(appDocumentChannels.id, unique));
      const foundSet = new Set(found.map((r) => r.id));
      for (const id of unique) {
        if (!foundSet.has(id)) throw new Error(`Channel not found: ${id}`);
      }
    }
    await db.delete(appKbFolderSyncChannels).where(eq(appKbFolderSyncChannels.syncId, row.id));
    if (unique.length > 0) {
      await db.insert(appKbFolderSyncChannels).values(
        unique.map((channelId) => ({ syncId: row.id, channelId })),
      );
    }
    channelIds = unique;
  }

  return toFolderSyncPublic(updated ?? row, channelIds);
}

export async function touchLastAutoSyncAt(syncId: string): Promise<void> {
  await db
    .update(appKbFolderSyncs)
    .set({ lastAutoSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(appKbFolderSyncs.id, syncId));
}

export async function listAutoSyncConfigsDue(now = new Date()): Promise<
  Array<{ row: KbFolderSyncConfigRow; channelIds: string[] }>
> {
  const rows = await db
    .select()
    .from(appKbFolderSyncs)
    .where(eq(appKbFolderSyncs.autoSyncEnabled, true));

  const due: Array<{ row: KbFolderSyncConfigRow; channelIds: string[] }> = [];
  for (const row of rows) {
    const channelIds = await listChannelIdsForSync(row.id);
    if (channelIds.length === 0) continue;

    const last = row.lastAutoSyncAt?.getTime() ?? 0;
    const intervalMs = row.syncIntervalMinutes * 60_000;
    if (now.getTime() - last >= intervalMs) {
      due.push({ row, channelIds });
    }
  }
  return due;
}
