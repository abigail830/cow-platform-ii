import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { appDocumentChannels, appDocuments, appPipelineJobs, db } from '../db/index.ts';
import { getModelConfigById } from '../shared/model-config-store.ts';
import { getPipelineConfigById } from '../shared/pipeline-config-store.ts';
import { buildChannelTree, collectDescendantIds } from './channel-tree.ts';
import {
  getLatestPipelineJobForDocument,
  getLatestPipelineJobsForDocuments,
  pipelineJobToPublic,
} from './pipeline-jobs.ts';

export type ChannelRow = typeof appDocumentChannels.$inferSelect;
export type DocumentRow = typeof appDocuments.$inferSelect;

export type ChannelNode = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  pipeline_id: string | null;
  auto_start_pipeline: boolean;
  metadata_extraction_model_id: string | null;
  created_at: string;
  updated_at: string;
  children: ChannelNode[];
};

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
    auto_start_pipeline: row.autoStartPipeline,
    metadata_extraction_model_id: row.metadataExtractionModelId,
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
    metadataExtractionModelId?: string | null;
    pipelineId?: string | null;
    autoStartPipeline?: boolean;
  },
): Promise<ReturnType<typeof toChannelPublic>> {
  const existing = await getChannelById(id);
  if (!existing) throw new Error('Channel not found');

  if (input.pipelineId !== undefined && input.pipelineId !== null) {
    const pipeline = await getPipelineConfigById(input.pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');
    if (!pipeline.isEnabled) throw new Error('Pipeline is disabled');
  }

  if (input.metadataExtractionModelId !== undefined && input.metadataExtractionModelId !== null) {
    const modelId = input.metadataExtractionModelId.trim();
    if (!modelId) {
      input.metadataExtractionModelId = null;
    } else {
      const model = await getModelConfigById(modelId);
      if (!model) throw new Error('Extraction model not found');
      if (model.apiType !== 'chat-completions') {
        throw new Error('Extraction model must be a chat-completions model');
      }
      input.metadataExtractionModelId = modelId;
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
      ...(input.metadataExtractionModelId !== undefined
        ? { metadataExtractionModelId: input.metadataExtractionModelId }
        : {}),
      ...(input.pipelineId !== undefined ? { pipelineId: input.pipelineId } : {}),
      ...(input.autoStartPipeline !== undefined ? { autoStartPipeline: input.autoStartPipeline } : {}),
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

  const jobMap = await getLatestPipelineJobsForDocuments(rows.map((row) => row.id));

  return {
    items: rows.map((row) => toDocumentPublic(row, jobMap.get(row.id))),
    total: countRow?.count ?? 0,
  };
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

export async function getDocumentStats(): Promise<{ channels: number; documents: number }> {
  const [channelRow] = await db.select({ count: sql<number>`count(*)::int` }).from(appDocumentChannels);
  const [docRow] = await db.select({ count: sql<number>`count(*)::int` }).from(appDocuments);
  return {
    channels: channelRow?.count ?? 0,
    documents: docRow?.count ?? 0,
  };
}

export type DocumentContentResponse = {
  id: string;
  name: string;
  file_type: string;
  status: string;
  metadata: Record<string, unknown>;
  markdown: string | null;
  page_index: Record<string, unknown> | null;
  has_markdown: boolean;
  has_page_index: boolean;
};

export async function getDocumentContent(id: string): Promise<DocumentContentResponse> {
  const doc = await getDocumentById(id);
  if (!doc) throw new Error('Document not found');

  const { readStorageText, storagePrefixFromS3Key } = await import('../storage/document-content.ts');
  const prefix = storagePrefixFromS3Key(doc.s3Key);

  const [markdown, pageIndexRaw] = await Promise.all([
    readStorageText(`${prefix}/markdown.md`),
    readStorageText(`${prefix}/page_index.json`),
  ]);

  let page_index: Record<string, unknown> | null = null;
  if (pageIndexRaw) {
    try {
      const parsed = JSON.parse(pageIndexRaw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        page_index = parsed as Record<string, unknown>;
      }
    } catch {
      page_index = null;
    }
  }

  return {
    id: doc.id,
    name: doc.name,
    file_type: doc.fileType,
    status: doc.status,
    metadata: doc.metadata ?? {},
    markdown,
    page_index,
    has_markdown: Boolean(markdown?.trim()),
    has_page_index: page_index !== null,
  };
}
