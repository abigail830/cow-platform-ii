import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  appDocumentChannels,
  appDocuments,
  appKbChunkDocuments,
  appKbImportJobs,
  appKbItems,
  appKbFaqs,
  appKnowledgeBases,
  db,
  type KnowledgeBaseType,
  type KbChunkConfig,
  type KbImportJobStatus,
  type KbImportJobKind,
  type KbFaqSettings,
  type KbItemImportStatus,
} from '../db/index.ts';
import { buildChannelPath, collectDescendantIds } from './channel-tree.ts';
import { getChannelById, getDocumentById } from './documents.ts';
import { storagePrefixFromS3Key } from '../storage/document-content.ts';
import {
  KB_IMPORT_MAX_MARKDOWN_BYTES,
  KB_IMPORT_MAX_PARSING_RESULT_BYTES,
} from '../shared/kb-import-limits.ts';
import { resolveDefaultPipelineIdForKbType } from '../shared/kb-pipeline-binding.ts';
import { getPipelineConfigById } from '../shared/pipeline-config-store.ts';
import { getModelConfigById } from '../shared/model-config-store.ts';
import { countIndexedDocuments, countKbChunks } from './kb-chunks.ts';
import { upsertKbChunkDocumentIndexing } from './kb-chunk-documents.ts';
import { enrichFaqSettingsForApi } from '../builtin-agents/enrich-faq-settings.ts';

async function ragKbCounts(knowledgeBaseId: string): Promise<{ indexedDocuments: number; chunks: number }> {
  try {
    const [indexedDocuments, chunks] = await Promise.all([
      countIndexedDocuments(knowledgeBaseId),
      countKbChunks(knowledgeBaseId),
    ]);
    return { indexedDocuments, chunks };
  } catch (error) {
    console.warn(`[kb] RAG count query failed for ${knowledgeBaseId}:`, error);
    return { indexedDocuments: 0, chunks: 0 };
  }
}

async function ragDocumentCountByKbId(): Promise<Map<string, number>> {
  try {
    const rows = await db
      .select({
        knowledgeBaseId: appKbChunkDocuments.knowledgeBaseId,
        count: sql<number>`count(*)::int`,
      })
      .from(appKbChunkDocuments)
      .groupBy(appKbChunkDocuments.knowledgeBaseId);
    return new Map(rows.map((c) => [c.knowledgeBaseId, c.count]));
  } catch (error) {
    console.warn('[kb] chunk document counts unavailable:', error);
    return new Map();
  }
}

async function faqCountByKbId(): Promise<Map<string, number>> {
  try {
    const rows = await db
      .select({
        knowledgeBaseId: appKbFaqs.knowledgeBaseId,
        count: sql<number>`count(*)::int`,
      })
      .from(appKbFaqs)
      .groupBy(appKbFaqs.knowledgeBaseId);
    return new Map(rows.map((c) => [c.knowledgeBaseId, c.count]));
  } catch (error) {
    console.warn('[kb] FAQ counts unavailable:', error);
    return new Map();
  }
}

export type KnowledgeBaseRow = typeof appKnowledgeBases.$inferSelect;
export type KbItemRow = typeof appKbItems.$inferSelect;
export type KbImportJobRow = typeof appKbImportJobs.$inferSelect;

function kbCapabilities(type: string) {
  if (type === 'page_index') {
    return { import: true, index: false, manual_create: false, extract: false };
  }
  if (type === 'rag') {
    return { import: true, index: true, manual_create: false, extract: false };
  }
  if (type === 'faq') {
    return { import: false, index: true, manual_create: true, extract: true };
  }
  return { import: false, index: false, manual_create: false, extract: false };
}

function isKbConfigured(row: KnowledgeBaseRow): boolean {
  if (row.type === 'rag' || row.type === 'faq') {
    return row.embeddingModelConfigId != null;
  }
  return true;
}

function toKnowledgeBasePublic(
  row: KnowledgeBaseRow,
  options?: {
    itemCount?: number;
    pipelineName?: string | null;
    embeddingModelName?: string | null;
    chunkCount?: number;
    faqSettings?: KbFaqSettings | Awaited<ReturnType<typeof enrichFaqSettingsForApi>>;
  },
) {
  const itemCount = options?.itemCount;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    pipeline_id: row.pipelineId,
    pipeline_name: options?.pipelineName ?? null,
    embedding_model_config_id: row.embeddingModelConfigId,
    embedding_model_name: options?.embeddingModelName ?? null,
    embedding_dimensions: row.embeddingDimensions,
    chunk_config: row.chunkConfig,
    metadata_keys: row.metadataKeys,
    faq_settings:
      row.type === 'faq'
        ? (options?.faqSettings ?? (row.faqSettings as KbFaqSettings))
        : undefined,
    is_configured: isKbConfigured(row),
    chunk_count: options?.chunkCount,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    capabilities: kbCapabilities(row.type),
    item_count: itemCount,
  };
}

function toKbItemPublic(
  row: KbItemRow,
  options?: { includeContent?: boolean },
) {
  const includeContent = options?.includeContent ?? false;
  return {
    id: row.id,
    knowledge_base_id: row.knowledgeBaseId,
    document_id: row.documentId,
    document_name: row.documentName,
    channel_path: row.channelPath,
    original_s3_key: row.originalS3Key,
    original_download_path: `/api/documents/${row.documentId}/download`,
    metadata: includeContent ? row.metadata : undefined,
    page_index: includeContent ? row.pageIndex : undefined,
    markdown: includeContent ? row.markdown : undefined,
    parsing_result: includeContent ? row.parsingResult : undefined,
    import_status: row.importStatus,
    import_error: row.importError,
    import_warnings: row.importWarnings,
    imported_at: row.importedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toKbImportJobPublic(row: KbImportJobRow) {
  return {
    id: row.id,
    knowledge_base_id: row.knowledgeBaseId,
    status: row.status,
    job_kind: row.jobKind,
    document_ids: row.documentIds,
    faq_ids: row.faqIds,
    total_count: row.totalCount,
    completed_count: row.completedCount,
    failed_count: row.failedCount,
    error_message: row.errorMessage,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function listKnowledgeBases(
  visibleIds?: Set<string>,
): Promise<ReturnType<typeof toKnowledgeBasePublic>[]> {
  const rows = await db
    .select()
    .from(appKnowledgeBases)
    .orderBy(desc(appKnowledgeBases.updatedAt));

  const filteredRows =
    visibleIds === undefined ? rows : rows.filter((row) => visibleIds.has(row.id));

  const itemCounts = await db
    .select({
      knowledgeBaseId: appKbItems.knowledgeBaseId,
      count: sql<number>`count(*)::int`,
    })
    .from(appKbItems)
    .groupBy(appKbItems.knowledgeBaseId);

  const chunkDocCountMap = await ragDocumentCountByKbId();
  const faqCountMap = await faqCountByKbId();
  const itemCountMap = new Map(itemCounts.map((c) => [c.knowledgeBaseId, c.count]));

  return filteredRows.map((row) => {
    let itemCount = 0;
    if (row.type === 'rag') {
      itemCount = chunkDocCountMap.get(row.id) ?? 0;
    } else if (row.type === 'faq') {
      itemCount = faqCountMap.get(row.id) ?? 0;
    } else {
      itemCount = itemCountMap.get(row.id) ?? 0;
    }
    return toKnowledgeBasePublic(row, { itemCount });
  });
}

export async function getKnowledgeBaseById(id: string): Promise<KnowledgeBaseRow | null> {
  const [row] = await db.select().from(appKnowledgeBases).where(eq(appKnowledgeBases.id, id)).limit(1);
  return row ?? null;
}

async function enrichKbPublic(row: KnowledgeBaseRow) {
  let pipelineName: string | null = null;
  if (row.pipelineId) {
    const pipeline = await getPipelineConfigById(row.pipelineId);
    pipelineName = pipeline?.pipelineName ?? null;
  }

  let embeddingModelName: string | null = null;
  if (row.embeddingModelConfigId) {
    const model = await getModelConfigById(row.embeddingModelConfigId);
    embeddingModelName = model?.name ?? null;
  }

  let itemCount = 0;
  let chunkCount: number | undefined;
  if (row.type === 'rag') {
    const counts = await ragKbCounts(row.id);
    itemCount = counts.indexedDocuments;
    chunkCount = counts.chunks;
  } else if (row.type === 'faq') {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(appKbFaqs)
      .where(eq(appKbFaqs.knowledgeBaseId, row.id));
    itemCount = countRow?.count ?? 0;
  } else {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(appKbItems)
      .where(eq(appKbItems.knowledgeBaseId, row.id));
    itemCount = countRow?.count ?? 0;
  }

  return toKnowledgeBasePublic(row, {
    itemCount,
    pipelineName,
    embeddingModelName,
    chunkCount,
    faqSettings:
      row.type === 'faq'
        ? await enrichFaqSettingsForApi(row.id, row.faqSettings as KbFaqSettings)
        : undefined,
  });
}

export async function getKnowledgeBasePublicById(id: string) {
  const row = await getKnowledgeBaseById(id);
  if (!row) return null;
  return enrichKbPublic(row);
}

export async function createKnowledgeBase(input: {
  name: string;
  description?: string | null;
  type: KnowledgeBaseType;
  createdBy?: string | null;
}) {
  const name = input.name.trim();
  if (!name || name.length > 256) throw new Error('Name must be 1–256 characters');
  if (input.type !== 'page_index' && input.type !== 'rag' && input.type !== 'faq') {
    throw new Error('Invalid knowledge base type');
  }

  const pipelineId = await resolveDefaultPipelineIdForKbType(input.type);

  const [row] = await db
    .insert(appKnowledgeBases)
    .values({
      name,
      description: input.description?.trim() || null,
      type: input.type,
      pipelineId,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  let pipelineName: string | null = null;
  if (row!.pipelineId) {
    const pipeline = await getPipelineConfigById(row!.pipelineId);
    pipelineName = pipeline?.pipelineName ?? null;
  }

  return toKnowledgeBasePublic(row!, { itemCount: 0, pipelineName });
}

export async function updateKnowledgeBase(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    embedding_model_config_id?: string | null;
    embedding_dimensions?: number;
    chunk_config?: KbChunkConfig;
    metadata_keys?: string[];
    faq_settings?: KbFaqSettings;
  },
) {
  const row = await getKnowledgeBaseById(id);
  if (!row) throw new Error('Knowledge base not found');

  const name = input.name !== undefined ? input.name.trim() : row.name;
  if (!name || name.length > 256) throw new Error('Name must be 1–256 characters');

  const description =
    input.description !== undefined ? input.description?.trim() || null : row.description;

  if (
    input.embedding_model_config_id !== undefined &&
    (row.type === 'rag' || row.type === 'faq')
  ) {
    const modelId = input.embedding_model_config_id?.trim() || null;
    if (modelId) {
      const model = await getModelConfigById(modelId);
      if (!model) throw new Error('Embedding model not found');
      if (model.apiType !== 'embeddings') {
        throw new Error('Selected model must have api_type embeddings');
      }
    }
  }

  if (input.embedding_dimensions !== undefined) {
    const dims = input.embedding_dimensions;
    if (!Number.isInteger(dims) || dims < 1 || dims > 65536) {
      throw new Error('embedding_dimensions must be a positive integer');
    }
  }

  const [updated] = await db
    .update(appKnowledgeBases)
    .set({
      name,
      description,
      ...(input.embedding_model_config_id !== undefined &&
      (row.type === 'rag' || row.type === 'faq')
        ? { embeddingModelConfigId: input.embedding_model_config_id?.trim() || null }
        : {}),
      ...(input.embedding_dimensions !== undefined
        ? { embeddingDimensions: input.embedding_dimensions }
        : {}),
      ...(input.chunk_config !== undefined && row.type === 'rag'
        ? { chunkConfig: input.chunk_config }
        : {}),
      ...(input.metadata_keys !== undefined &&
      (row.type === 'rag' || row.type === 'faq')
        ? { metadataKeys: input.metadata_keys }
        : {}),
      ...(input.faq_settings !== undefined && row.type === 'faq'
        ? { faqSettings: { ...row.faqSettings, ...input.faq_settings } }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(appKnowledgeBases.id, id))
    .returning();

  return enrichKbPublic(updated!);
}

/** Deletes KB row; cascades to app_kb_items and app_kb_import_jobs (not app_documents). */
export async function deleteKnowledgeBase(id: string): Promise<void> {
  const row = await getKnowledgeBaseById(id);
  if (!row) throw new Error('Knowledge base not found');
  await db.delete(appKnowledgeBases).where(eq(appKnowledgeBases.id, id));
}

async function allChannelRows() {
  const rows = await db
    .select({
      id: appDocumentChannels.id,
      name: appDocumentChannels.name,
      parentId: appDocumentChannels.parentId,
    })
    .from(appDocumentChannels);
  return rows.map((r) => ({ id: r.id, name: r.name, parent_id: r.parentId }));
}

export async function expandDocumentIdsForImport(input: {
  channelIds?: string[];
  documentIds?: string[];
}): Promise<string[]> {
  const channelRows = await allChannelRows();
  const channelIdSet = new Set<string>();

  for (const channelId of input.channelIds ?? []) {
    const trimmed = channelId.trim();
    if (!trimmed) continue;
    const channel = await getChannelById(trimmed);
    if (!channel) throw new Error(`Channel not found: ${trimmed}`);
    channelIdSet.add(trimmed);
    const descendants = collectDescendantIds(
      trimmed,
      channelRows.map((r) => ({ id: r.id, parent_id: r.parent_id })),
    );
    for (const id of descendants) channelIdSet.add(id);
  }

  const docIdSet = new Set<string>();
  for (const docId of input.documentIds ?? []) {
    const trimmed = docId.trim();
    if (trimmed) docIdSet.add(trimmed);
  }

  if (channelIdSet.size > 0) {
    const docs = await db
      .select({ id: appDocuments.id })
      .from(appDocuments)
      .where(inArray(appDocuments.channelId, [...channelIdSet]));
    for (const doc of docs) docIdSet.add(doc.id);
  }

  return [...docIdSet];
}

export async function listKbItems(
  knowledgeBaseId: string,
  input?: { offset?: number; limit?: number; includeContent?: boolean },
) {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type === 'rag') {
    throw new Error('Use indexed-documents for RAG knowledge bases');
  }

  const offset = Math.max(input?.offset ?? 0, 0);
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);
  const includeContent = input?.includeContent ?? false;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appKbItems)
    .where(eq(appKbItems.knowledgeBaseId, knowledgeBaseId));

  const rows = await db
    .select()
    .from(appKbItems)
    .where(eq(appKbItems.knowledgeBaseId, knowledgeBaseId))
    .orderBy(desc(appKbItems.updatedAt))
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map((row) => toKbItemPublic(row, { includeContent })),
    total: countRow?.count ?? 0,
  };
}

export async function getKbItemById(knowledgeBaseId: string, itemId: string) {
  const [row] = await db
    .select()
    .from(appKbItems)
    .where(and(eq(appKbItems.id, itemId), eq(appKbItems.knowledgeBaseId, knowledgeBaseId)))
    .limit(1);
  if (!row) return null;
  return toKbItemPublic(row, { includeContent: true });
}

export async function getKbItemByDocumentId(knowledgeBaseId: string, documentId: string) {
  const [row] = await db
    .select()
    .from(appKbItems)
    .where(
      and(eq(appKbItems.knowledgeBaseId, knowledgeBaseId), eq(appKbItems.documentId, documentId)),
    )
    .limit(1);
  return row ?? null;
}

export async function buildDocumentImportContext(documentId: string) {
  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error('Document not found');

  const channelRows = await allChannelRows();
  const channelPath = buildChannelPath(doc.channelId, channelRows);
  const prefix = storagePrefixFromS3Key(doc.s3Key);

  return {
    id: doc.id,
    name: doc.name,
    channel_id: doc.channelId,
    channel_path: channelPath,
    file_hash: doc.fileHash,
    s3_key: doc.s3Key,
    s3_prefix: prefix,
    original_s3_key: doc.s3Key,
    metadata: doc.metadata ?? {},
    status: doc.status,
  };
}

export async function upsertKbItemPending(
  knowledgeBaseId: string,
  documentId: string,
): Promise<void> {
  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const channelRows = await allChannelRows();
  const channelPath = buildChannelPath(doc.channelId, channelRows);

  const existing = await getKbItemByDocumentId(knowledgeBaseId, documentId);
  if (existing) {
    await db
      .update(appKbItems)
      .set({
        documentName: doc.name,
        channelPath,
        originalS3Key: doc.s3Key,
        importStatus: 'pending',
        importError: null,
        updatedAt: new Date(),
      })
      .where(eq(appKbItems.id, existing.id));
    return;
  }

  await db.insert(appKbItems).values({
    knowledgeBaseId,
    documentId,
    documentName: doc.name,
    channelPath,
    originalS3Key: doc.s3Key,
    importStatus: 'pending',
  });
}

export async function upsertKbItemFromWorker(
  knowledgeBaseId: string,
  documentId: string,
  input: {
    document_name?: string;
    channel_path?: string;
    original_s3_key?: string;
    metadata?: Record<string, unknown> | null;
    page_index?: Record<string, unknown> | null;
    markdown?: string | null;
    parsing_result?: Record<string, unknown> | null;
    import_status: KbItemImportStatus;
    import_error?: string | null;
    import_warnings?: string[] | null;
  },
) {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');

  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error('Document not found');

  const warnings: string[] = [...(input.import_warnings ?? [])];
  let markdown = input.markdown ?? null;
  if (markdown && Buffer.byteLength(markdown, 'utf8') > KB_IMPORT_MAX_MARKDOWN_BYTES) {
    markdown = markdown.slice(0, KB_IMPORT_MAX_MARKDOWN_BYTES);
    warnings.push('markdown_truncated');
  }

  let parsingResult = input.parsing_result ?? null;
  if (parsingResult) {
    const raw = JSON.stringify(parsingResult);
    if (Buffer.byteLength(raw, 'utf8') > KB_IMPORT_MAX_PARSING_RESULT_BYTES) {
      parsingResult = {
        file_hash: parsingResult.file_hash,
        parser: parsingResult.parser,
        document_kind: parsingResult.document_kind,
        page_count: parsingResult.page_count,
        format: parsingResult.format,
        sheets: parsingResult.sheets,
      };
      warnings.push('parsing_result_slimmed');
    }
  }

  const channelRows = await allChannelRows();
  const channelPath = input.channel_path ?? buildChannelPath(doc.channelId, channelRows);
  const now = new Date();
  const importedAt = input.import_status === 'completed' ? now : null;

  const existing = await getKbItemByDocumentId(knowledgeBaseId, documentId);
  const values = {
    documentName: input.document_name ?? doc.name,
    channelPath,
    originalS3Key: input.original_s3_key ?? doc.s3Key,
    metadata: input.metadata ?? null,
    pageIndex: input.page_index ?? null,
    markdown,
    parsingResult,
    importStatus: input.import_status,
    importError: input.import_error ?? null,
    importWarnings: warnings.length > 0 ? warnings : null,
    importedAt,
    updatedAt: now,
  };

  if (existing) {
    const [row] = await db
      .update(appKbItems)
      .set(values)
      .where(eq(appKbItems.id, existing.id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(appKbItems)
    .values({
      knowledgeBaseId,
      documentId,
      ...values,
    })
    .returning();
  return row!;
}

export async function deleteKbItem(knowledgeBaseId: string, itemId: string): Promise<void> {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');

  const [deleted] = await db
    .delete(appKbItems)
    .where(and(eq(appKbItems.id, itemId), eq(appKbItems.knowledgeBaseId, knowledgeBaseId)))
    .returning({ id: appKbItems.id });

  if (!deleted) throw new Error('Item not found');
}

export async function deleteKbItems(knowledgeBaseId: string, itemIds: string[]): Promise<number> {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');

  const uniqueIds = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error('No items selected');

  const deleted = await db
    .delete(appKbItems)
    .where(and(eq(appKbItems.knowledgeBaseId, knowledgeBaseId), inArray(appKbItems.id, uniqueIds)))
    .returning({ id: appKbItems.id });

  return deleted.length;
}

export async function createKbImportJob(input: {
  knowledgeBaseId: string;
  documentIds: string[];
  faqIds?: string[];
  jobKind?: KbImportJobKind | null;
  pipelineId?: string | null;
  createdBy?: string | null;
}): Promise<KbImportJobRow> {
  const faqIds = input.faqIds ?? [];
  const documentIds = input.documentIds;
  const totalCount =
    faqIds.length > 0 ? faqIds.length : documentIds.length;

  const [row] = await db
    .insert(appKbImportJobs)
    .values({
      knowledgeBaseId: input.knowledgeBaseId,
      pipelineId: input.pipelineId ?? null,
      jobKind: input.jobKind ?? null,
      status: 'pending',
      documentIds,
      faqIds,
      totalCount,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row!;
}

export async function getKbImportJobById(id: string): Promise<KbImportJobRow | null> {
  const [row] = await db.select().from(appKbImportJobs).where(eq(appKbImportJobs.id, id)).limit(1);
  return row ?? null;
}

export async function getKbImportJobPublic(knowledgeBaseId: string, jobId: string) {
  const job = await getKbImportJobById(jobId);
  if (!job || job.knowledgeBaseId !== knowledgeBaseId) return null;
  return toKbImportJobPublic(job);
}

export async function updateKbImportJob(
  id: string,
  input: {
    status?: KbImportJobStatus;
    completedCount?: number;
    failedCount?: number;
    errorMessage?: string | null;
  },
) {
  const [row] = await db
    .update(appKbImportJobs)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.completedCount !== undefined ? { completedCount: input.completedCount } : {}),
      ...(input.failedCount !== undefined ? { failedCount: input.failedCount } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appKbImportJobs.id, id))
    .returning();
  return row ?? null;
}

export async function startKbPageIndexImport(input: {
  knowledgeBaseId: string;
  channelIds?: string[];
  documentIds?: string[];
  createdBy?: string | null;
}) {
  const kb = await getKnowledgeBaseById(input.knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'page_index') {
    throw new Error('Import is only supported for PageIndex knowledge bases');
  }
  if (!kb.pipelineId) {
    throw new Error('Knowledge base has no import pipeline configured');
  }

  const pipeline = await getPipelineConfigById(kb.pipelineId);
  if (!pipeline || !pipeline.isEnabled) {
    throw new Error('Knowledge base import pipeline is not available');
  }

  const documentIds = await expandDocumentIdsForImport({
    channelIds: input.channelIds,
    documentIds: input.documentIds,
  });
  if (documentIds.length === 0) throw new Error('No documents selected for import');

  for (const documentId of documentIds) {
    await upsertKbItemPending(input.knowledgeBaseId, documentId);
  }

  const job = await createKbImportJob({
    knowledgeBaseId: input.knowledgeBaseId,
    documentIds,
    faqIds: [],
    jobKind: 'pageindex_import',
    pipelineId: kb.pipelineId,
    createdBy: input.createdBy,
  });

  return { job: toKbImportJobPublic(job), document_count: documentIds.length };
}

export async function startKbRagIndexImport(input: {
  knowledgeBaseId: string;
  channelIds?: string[];
  documentIds?: string[];
  createdBy?: string | null;
}) {
  const kb = await getKnowledgeBaseById(input.knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'rag') {
    throw new Error('Indexing import is only supported for RAG knowledge bases');
  }
  if (!kb.embeddingModelConfigId) {
    throw new Error('Configure an embedding model in settings before importing');
  }
  if (!kb.pipelineId) {
    throw new Error('Knowledge base has no index pipeline configured');
  }

  const pipeline = await getPipelineConfigById(kb.pipelineId);
  if (!pipeline || !pipeline.isEnabled) {
    throw new Error('Knowledge base index pipeline is not available');
  }

  const documentIds = await expandDocumentIdsForImport({
    channelIds: input.channelIds,
    documentIds: input.documentIds,
  });
  if (documentIds.length === 0) throw new Error('No documents selected for import');

  for (const documentId of documentIds) {
    await upsertKbChunkDocumentIndexing(input.knowledgeBaseId, documentId);
  }

  const job = await createKbImportJob({
    knowledgeBaseId: input.knowledgeBaseId,
    documentIds,
    faqIds: [],
    jobKind: 'rag_index',
    pipelineId: kb.pipelineId,
    createdBy: input.createdBy,
  });

  return { job: toKbImportJobPublic(job), document_count: documentIds.length };
}

export async function getKbWorkerConfig(knowledgeBaseId: string) {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  return {
    id: kb.id,
    type: kb.type,
    embedding_model_config_id: kb.embeddingModelConfigId,
    embedding_dimensions: kb.embeddingDimensions,
    chunk_config: kb.chunkConfig,
    metadata_keys: kb.metadataKeys,
    faq_settings: kb.type === 'faq' ? kb.faqSettings : undefined,
  };
}

export async function resolveKbImportPipelineForJob(jobId: string) {
  const job = await getKbImportJobById(jobId);
  if (!job) throw new Error('KB import job not found');

  let pipelineId = job.pipelineId;
  if (!pipelineId) {
    const kb = await getKnowledgeBaseById(job.knowledgeBaseId);
    pipelineId = kb?.pipelineId ?? null;
  }
  if (!pipelineId) throw new Error('KB import pipeline not configured');

  const pipeline = await getPipelineConfigById(pipelineId);
  if (!pipeline || !pipeline.isEnabled) {
    throw new Error('KB import pipeline is not available');
  }

  return { job, pipeline };
}

export type KbImportJobWorkerContext = {
  id: string;
  knowledge_base_id: string;
  status: KbImportJobStatus;
  job_kind: string | null;
  document_ids: string[];
  faq_ids: string[];
  total_count: number;
  completed_count: number;
  failed_count: number;
  api_url: string;
};

export async function buildKbImportJobWorkerContext(jobId: string): Promise<KbImportJobWorkerContext> {
  const job = await getKbImportJobById(jobId);
  if (!job) throw new Error('KB import job not found');

  const apiUrl =
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;

  return {
    id: job.id,
    knowledge_base_id: job.knowledgeBaseId,
    status: job.status as KbImportJobStatus,
    job_kind: job.jobKind,
    document_ids: job.documentIds,
    faq_ids: job.faqIds,
    total_count: job.totalCount,
    completed_count: job.completedCount,
    failed_count: job.failedCount,
    api_url: apiUrl,
  };
}

export async function listImportSources() {
  const channels = await db
    .select()
    .from(appDocumentChannels)
    .orderBy(asc(appDocumentChannels.sortOrder), asc(appDocumentChannels.name));

  const channelList = channels.map((c) => ({
    id: c.id,
    name: c.name,
    parent_id: c.parentId,
    sort_order: c.sortOrder,
  }));

  const docs = await db
    .select({
      id: appDocuments.id,
      name: appDocuments.name,
      channel_id: appDocuments.channelId,
      file_type: appDocuments.fileType,
      status: appDocuments.status,
      updated_at: appDocuments.updatedAt,
    })
    .from(appDocuments)
    .orderBy(desc(appDocuments.updatedAt));

  const documentsByChannel = new Map<string, typeof docs>();
  for (const doc of docs) {
    const list = documentsByChannel.get(doc.channel_id) ?? [];
    list.push(doc);
    documentsByChannel.set(doc.channel_id, list);
  }

  return {
    channels: channelList,
    documents_by_channel: Object.fromEntries(
      [...documentsByChannel.entries()].map(([channelId, items]) => [
        channelId,
        items.map((d) => ({
          id: d.id,
          name: d.name,
          file_type: d.file_type,
          status: d.status,
          updated_at: d.updated_at.toISOString(),
        })),
      ]),
    ),
  };
}
