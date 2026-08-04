import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  appKbFaqs,
  db,
  type KbFaqIndexStatus,
  type KbFaqPublicationStatus,
  type KbFaqSettings,
  type KbFaqSourceType,
} from '../db/index.ts';
import { getDocumentById } from './documents.ts';
import { decodeEmbeddingBase64 } from '../shared/kb-chunk-embedding.ts';
import { spawnKbImportWorker } from './kb-import-runner.ts';
import { resolveKbFaqWorkflowAgent } from '../builtin-agents/resolve-workflow-agent.ts';
import { resolveKbFaqExtractWorkerConfig } from '../builtin-agents/enrich-faq-settings.ts';
import { FAQ_EXTRACT_NOT_CONFIGURED } from '../builtin-agents/worker-llm-config.ts';
import { runSyncAgent } from '../builtin-agents/sync-agent-runner.ts';
import {
  createKbImportJob,
  expandDocumentIdsForImport,
  getKnowledgeBaseById,
  toKbImportJobPublic,
  type KbImportJobRow,
} from './knowledge-bases.ts';
import { getPipelineConfigByPipelineName } from '../shared/pipeline-config-store.ts';
import { FAQ_KB_EXTRACT_PIPELINE_NAME, FAQ_KB_INDEX_PIPELINE_NAME } from '../shared/pipeline-catalog.ts';

export type KbFaqRow = typeof appKbFaqs.$inferSelect;

function questionContentHash(question: string): string {
  return createHash('sha256').update(question.trim()).digest('hex').slice(0, 32);
}

import { propagateDocMetadata } from '../shared/kb-faq-metadata.ts';

export function toKbFaqPublic(row: KbFaqRow) {
  return {
    id: row.id,
    knowledge_base_id: row.knowledgeBaseId,
    question: row.question,
    answer: row.answer,
    source_type: row.sourceType as KbFaqSourceType,
    source_document_id: row.sourceDocumentId,
    source_document_name: row.sourceDocumentName,
    publication_status: row.publicationStatus as KbFaqPublicationStatus,
    index_status: row.indexStatus as KbFaqIndexStatus | null,
    index_error: row.indexError,
    indexed_at: row.indexedAt?.toISOString() ?? null,
    doc_metadata: row.docMetadata,
    content_hash: row.contentHash,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function countKbFaqs(knowledgeBaseId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appKbFaqs)
    .where(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId));
  return row?.count ?? 0;
}

export async function listKbFaqs(
  knowledgeBaseId: string,
  options: {
    offset?: number;
    limit?: number;
    publication_status?: KbFaqPublicationStatus;
    index_status?: KbFaqIndexStatus;
    q?: string;
  } = {},
) {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'faq') throw new Error('FAQ list is only for FAQ knowledge bases');

  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));

  const conditions = [eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId)];
  if (options.publication_status) {
    conditions.push(eq(appKbFaqs.publicationStatus, options.publication_status));
  }
  if (options.index_status) {
    conditions.push(eq(appKbFaqs.indexStatus, options.index_status));
  }

  const where = and(...conditions);

  let rows = await db
    .select()
    .from(appKbFaqs)
    .where(where)
    .orderBy(desc(appKbFaqs.updatedAt))
    .limit(limit + 500);

  if (options.q?.trim()) {
    const needle = options.q.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.question.toLowerCase().includes(needle) || r.answer.toLowerCase().includes(needle),
    );
  }

  const total = rows.length;
  const slice = rows.slice(offset, offset + limit);

  return {
    items: slice.map(toKbFaqPublic),
    total,
    offset,
    limit,
  };
}

export async function getKbFaqById(knowledgeBaseId: string, faqId: string) {
  const [row] = await db
    .select()
    .from(appKbFaqs)
    .where(and(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId), eq(appKbFaqs.id, faqId)))
    .limit(1);
  return row ? toKbFaqPublic(row) : null;
}

export async function createKbFaq(input: {
  knowledgeBaseId: string;
  question: string;
  answer: string;
  createdBy?: string | null;
}) {
  const kb = await getKnowledgeBaseById(input.knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'faq') throw new Error('Manual FAQ create is only for FAQ knowledge bases');

  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question) throw new Error('Question is required');
  if (!answer) throw new Error('Answer is required');

  const [row] = await db
    .insert(appKbFaqs)
    .values({
      knowledgeBaseId: input.knowledgeBaseId,
      question,
      answer,
      sourceType: 'manual',
      publicationStatus: 'draft',
      contentHash: questionContentHash(question),
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return toKbFaqPublic(row!);
}

export async function updateKbFaq(
  knowledgeBaseId: string,
  faqId: string,
  input: { question?: string; answer?: string },
) {
  const [existing] = await db
    .select()
    .from(appKbFaqs)
    .where(and(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId), eq(appKbFaqs.id, faqId)))
    .limit(1);
  if (!existing) throw new Error('FAQ not found');

  const question = input.question !== undefined ? input.question.trim() : existing.question;
  const answer = input.answer !== undefined ? input.answer.trim() : existing.answer;
  if (!question) throw new Error('Question is required');
  if (!answer) throw new Error('Answer is required');

  const contentChanged =
    question !== existing.question || answer !== existing.answer;
  const questionChanged = question !== existing.question;

  const patch: Partial<typeof appKbFaqs.$inferInsert> = {
    question,
    answer,
    contentHash: questionContentHash(question),
    updatedAt: new Date(),
  };

  if (contentChanged && existing.publicationStatus === 'published') {
    patch.indexStatus = 'pending';
    patch.indexError = null;
  }
  if (questionChanged && existing.publicationStatus === 'published') {
    patch.embedding = null;
    patch.indexedAt = null;
  }

  const [row] = await db
    .update(appKbFaqs)
    .set(patch)
    .where(eq(appKbFaqs.id, faqId))
    .returning();

  return toKbFaqPublic(row!);
}

export async function deleteKbFaq(knowledgeBaseId: string, faqId: string): Promise<void> {
  const [deleted] = await db
    .delete(appKbFaqs)
    .where(and(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId), eq(appKbFaqs.id, faqId)))
    .returning({ id: appKbFaqs.id });
  if (!deleted) throw new Error('FAQ not found');
}

export async function deleteKbFaqs(knowledgeBaseId: string, faqIds: string[]): Promise<number> {
  const uniqueIds = [...new Set(faqIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error('No FAQs selected');

  const deleted = await db
    .delete(appKbFaqs)
    .where(and(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId), inArray(appKbFaqs.id, uniqueIds)))
    .returning({ id: appKbFaqs.id });
  return deleted.length;
}

async function resolveFaqDocMetadata(
  kbId: string,
  sourceDocumentId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!sourceDocumentId) return null;
  const kb = await getKnowledgeBaseById(kbId);
  if (!kb) return null;
  const doc = await getDocumentById(sourceDocumentId);
  if (!doc) return null;
  return propagateDocMetadata(doc.metadata as Record<string, unknown>, kb.metadataKeys ?? []);
}

export async function batchPublishKbFaqs(knowledgeBaseId: string, faqIds: string[]) {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'faq') throw new Error('Publish is only for FAQ knowledge bases');

  const uniqueIds = [...new Set(faqIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error('No FAQs selected');

  const now = new Date();
  await db
    .update(appKbFaqs)
    .set({
      publicationStatus: 'published',
      indexStatus: 'pending',
      indexError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId),
        inArray(appKbFaqs.id, uniqueIds),
        eq(appKbFaqs.publicationStatus, 'draft'),
      ),
    );

  const settings = (kb.faqSettings ?? {}) as KbFaqSettings;
  if (settings.auto_index_on_publish) {
    const job = await startKbFaqIndexJob({
      knowledgeBaseId,
      faqIds: uniqueIds,
    });
    await spawnKbImportWorker(job.id);
    return { published_count: uniqueIds.length, index_job: toKbImportJobPublic(job) };
  }

  return { published_count: uniqueIds.length };
}

export async function batchDraftKbFaqs(knowledgeBaseId: string, faqIds: string[]) {
  const uniqueIds = [...new Set(faqIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error('No FAQs selected');

  const updated = await db
    .update(appKbFaqs)
    .set({
      publicationStatus: 'draft',
      indexStatus: null,
      indexError: null,
      embedding: null,
      indexedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId), inArray(appKbFaqs.id, uniqueIds)))
    .returning({ id: appKbFaqs.id });

  return { draft_count: updated.length };
}

export async function batchCreateKbFaqsFromWorker(
  knowledgeBaseId: string,
  items: Array<{
    question: string;
    answer: string;
    source_document_id?: string | null;
    source_document_name?: string | null;
    doc_metadata?: Record<string, unknown> | null;
  }>,
) {
  if (items.length === 0) return 0;
  const now = new Date();
  const rows = items.map((item) => ({
    knowledgeBaseId,
    question: item.question.trim(),
    answer: item.answer.trim(),
    sourceType: 'extracted' as const,
    sourceDocumentId: item.source_document_id ?? null,
    sourceDocumentName: item.source_document_name ?? null,
    publicationStatus: 'draft' as const,
    docMetadata: item.doc_metadata ?? null,
    contentHash: questionContentHash(item.question),
    createdAt: now,
    updatedAt: now,
  }));
  const inserted = await db.insert(appKbFaqs).values(rows).returning({ id: appKbFaqs.id });
  return inserted.length;
}

export async function markKbFaqsIndexing(knowledgeBaseId: string, faqIds: string[]) {
  await db
    .update(appKbFaqs)
    .set({ indexStatus: 'indexing', indexError: null, updatedAt: new Date() })
    .where(
      and(
        eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId),
        inArray(appKbFaqs.id, faqIds),
        eq(appKbFaqs.publicationStatus, 'published'),
      ),
    );
}

export async function updateKbFaqFromWorker(
  knowledgeBaseId: string,
  faqId: string,
  input: {
    embedding?: string;
    index_status: KbFaqIndexStatus;
    index_error?: string | null;
    doc_metadata?: Record<string, unknown> | null;
  },
  expectedDimensions: number,
) {
  const patch: Partial<typeof appKbFaqs.$inferInsert> = {
    indexStatus: input.index_status,
    indexError: input.index_error ?? null,
    updatedAt: new Date(),
  };

  if (input.doc_metadata !== undefined) {
    patch.docMetadata = input.doc_metadata;
  }

  if (input.index_status === 'indexed' && input.embedding) {
    const embedding = decodeEmbeddingBase64(input.embedding);
    if (embedding.length !== expectedDimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${expectedDimensions}, got ${embedding.length}`,
      );
    }
    patch.embedding = embedding;
    patch.indexedAt = new Date();
  }

  if (input.index_status === 'failed') {
    patch.embedding = null;
    patch.indexedAt = null;
  }

  const [row] = await db
    .update(appKbFaqs)
    .set(patch)
    .where(and(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId), eq(appKbFaqs.id, faqId)))
    .returning();

  if (!row) throw new Error('FAQ not found');
  return toKbFaqPublic(row);
}

export async function getKbFaqsForWorker(knowledgeBaseId: string, faqIds: string[]) {
  const rows = await db
    .select()
    .from(appKbFaqs)
    .where(
      and(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId), inArray(appKbFaqs.id, faqIds)),
    );
  return rows.map(toKbFaqPublic);
}

export async function polishKbFaqAnswer(
  knowledgeBaseId: string,
  input: { faq_id?: string; question?: string; answer?: string },
) {
  const kb = await getKnowledgeBaseById(knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'faq') throw new Error('Polish is only for FAQ knowledge bases');

  let question = input.question?.trim() ?? '';
  let answer = input.answer?.trim() ?? '';

  if (input.faq_id) {
    const faq = await getKbFaqById(knowledgeBaseId, input.faq_id);
    if (!faq) throw new Error('FAQ not found');
    question = faq.question;
    answer = faq.answer;
  }

  if (!question || !answer) throw new Error('Question and answer are required');

  const settings = (kb.faqSettings ?? {}) as KbFaqSettings;

  const result = await runSyncAgent({
    workflowKey: 'faq_polish',
    variables: { question, answer },
    override: { agentDefId: settings.polish_agent_def_id ?? null },
    context: {
      triggerType: 'api',
      resourceType: 'knowledge_base',
      resourceId: knowledgeBaseId,
      inputSummary: question.slice(0, 200),
    },
  });

  return { answer: String(result.parsed) };
}

export async function startKbFaqExtractJob(input: {
  knowledgeBaseId: string;
  channelIds?: string[];
  documentIds?: string[];
  createdBy?: string | null;
}): Promise<KbImportJobRow> {
  const kb = await getKnowledgeBaseById(input.knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'faq') throw new Error('Extract is only for FAQ knowledge bases');

  let workerLlmConfig;
  try {
    workerLlmConfig = await resolveKbFaqExtractWorkerConfig(input.knowledgeBaseId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`${FAQ_EXTRACT_NOT_CONFIGURED} (${detail})`);
  }

  const pipeline = await getPipelineConfigByPipelineName(FAQ_KB_EXTRACT_PIPELINE_NAME);
  if (!pipeline || !pipeline.isEnabled) {
    throw new Error('FAQ extract pipeline is not available');
  }

  const documentIds = await expandDocumentIdsForImport({
    channelIds: input.channelIds,
    documentIds: input.documentIds,
  });
  if (documentIds.length === 0) throw new Error('No documents selected for extract');

  return createKbImportJob({
    knowledgeBaseId: input.knowledgeBaseId,
    documentIds,
    faqIds: [],
    jobKind: 'faq_extract',
    pipelineId: pipeline.id,
    workerLlmConfig,
    createdBy: input.createdBy,
  });
}

export async function startKbFaqIndexJob(input: {
  knowledgeBaseId: string;
  faqIds: string[];
  createdBy?: string | null;
}): Promise<KbImportJobRow> {
  const kb = await getKnowledgeBaseById(input.knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if (kb.type !== 'faq') throw new Error('Index is only for FAQ knowledge bases');
  if (!kb.embeddingModelConfigId) {
    throw new Error('Configure an embedding model in settings before indexing');
  }

  const pipeline = await getPipelineConfigByPipelineName(FAQ_KB_INDEX_PIPELINE_NAME);
  if (!pipeline || !pipeline.isEnabled) {
    throw new Error('FAQ index pipeline is not available');
  }

  const faqIds = [...new Set(input.faqIds.map((id) => id.trim()).filter(Boolean))];
  if (faqIds.length === 0) throw new Error('No FAQs selected for indexing');

  const rows = await db
    .select({ id: appKbFaqs.id, publicationStatus: appKbFaqs.publicationStatus })
    .from(appKbFaqs)
    .where(
      and(eq(appKbFaqs.knowledgeBaseId, input.knowledgeBaseId), inArray(appKbFaqs.id, faqIds)),
    );

  const publishedIds = rows.filter((r) => r.publicationStatus === 'published').map((r) => r.id);
  if (publishedIds.length === 0) {
    throw new Error('Only published FAQs can be indexed');
  }

  await markKbFaqsIndexing(input.knowledgeBaseId, publishedIds);

  return createKbImportJob({
    knowledgeBaseId: input.knowledgeBaseId,
    documentIds: [],
    faqIds: publishedIds,
    jobKind: 'faq_index',
    pipelineId: pipeline.id,
    createdBy: input.createdBy,
  });
}

export async function refreshFaqDocMetadataForIndex(
  knowledgeBaseId: string,
  faqId: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select()
    .from(appKbFaqs)
    .where(and(eq(appKbFaqs.knowledgeBaseId, knowledgeBaseId), eq(appKbFaqs.id, faqId)))
    .limit(1);
  if (!row?.sourceDocumentId) return row?.docMetadata ?? null;
  return await resolveFaqDocMetadata(knowledgeBaseId, row.sourceDocumentId);
}
