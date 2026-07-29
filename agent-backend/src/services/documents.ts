import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { appDocumentChannels, appDocuments, db } from '../db/index.ts';
import { buildChannelTree, collectDescendantIds } from './channel-tree.ts';

export type ChannelRow = typeof appDocumentChannels.$inferSelect;
export type DocumentRow = typeof appDocuments.$inferSelect;

export type ChannelNode = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children: ChannelNode[];
};

function toChannelPublic(row: ChannelRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parent_id: row.parentId,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toDocumentPublic(row: DocumentRow) {
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
  };
}

export async function listChannelTree(): Promise<ChannelNode[]> {
  const rows = await db
    .select()
    .from(appDocumentChannels)
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

  if (input.parentId) {
    const parent = await getChannelById(input.parentId);
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

  const [row] = await db
    .insert(appDocumentChannels)
    .values({
      name,
      description: input.description?.trim() || null,
      parentId: input.parentId ?? null,
      sortOrder: maxSort + 1,
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
  },
): Promise<ReturnType<typeof toChannelPublic>> {
  const existing = await getChannelById(id);
  if (!existing) throw new Error('Channel not found');

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

  const [row] = await db
    .update(appDocumentChannels)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appDocumentChannels.id, id))
    .returning();

  return toChannelPublic(row!);
}

export async function deleteChannel(id: string): Promise<void> {
  const existing = await getChannelById(id);
  if (!existing) throw new Error('Channel not found');

  const [child] = await db
    .select({ id: appDocumentChannels.id })
    .from(appDocumentChannels)
    .where(eq(appDocumentChannels.parentId, id))
    .limit(1);
  if (child) throw new Error('Channel has sub-channels. Delete or move them first.');

  const [doc] = await db
    .select({ id: appDocuments.id })
    .from(appDocuments)
    .where(eq(appDocuments.channelId, id))
    .limit(1);
  if (doc) throw new Error('Channel contains documents. Delete or move them first.');

  await db.delete(appDocumentChannels).where(eq(appDocumentChannels.id, id));
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

  const conditions = [eq(appDocuments.channelId, input.channelId)];
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

  return {
    items: rows.map(toDocumentPublic),
    total: countRow?.count ?? 0,
  };
}

export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(appDocuments).where(eq(appDocuments.id, id)).limit(1);
  return row ?? null;
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

export async function getDocumentStats(): Promise<{ channels: number; documents: number }> {
  const [channelRow] = await db.select({ count: sql<number>`count(*)::int` }).from(appDocumentChannels);
  const [docRow] = await db.select({ count: sql<number>`count(*)::int` }).from(appDocuments);
  return {
    channels: channelRow?.count ?? 0,
    documents: docRow?.count ?? 0,
  };
}
