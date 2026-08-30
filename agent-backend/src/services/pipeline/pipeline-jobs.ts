import { desc, eq, inArray } from 'drizzle-orm';
import {
  appDocuments,
  appPipelineJobs,
  db,
  type PipelineJobStage,
  type PipelineProvider,
} from '../../db/index.ts';
import { getChannelById } from '../documents/documents.ts';
import { getS3Config } from '../../storage/s3-config.ts';

/** Document Channel parse pipelines (async cloud submit → poll → finalize). */
export const ASYNC_PIPELINE_NAMES = new Set([
  'baidu-doc-parse',
  'aliyun-docmind-parse',
  'paddleocr-doc-parse',
]);

export function isDocumentAsyncPipelineName(pipelineName: string): boolean {
  return ASYNC_PIPELINE_NAMES.has(pipelineName);
}

export function pipelineProviderForName(pipelineName: string): PipelineProvider | null {
  if (pipelineName === 'baidu-doc-parse') return 'baidu';
  if (pipelineName === 'paddleocr-doc-parse') return 'paddle';
  if (pipelineName === 'aliyun-docmind-parse') return 'aliyun';
  return null;
}

function s3PrefixFromKey(s3Key: string): string {
  const normalized = s3Key.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

/** Normalize pipeline override: blank → null (CLI uses packaged default). */
export function snapshotConfigYaml(configYaml: string | null | undefined): string | null {
  const raw = configYaml?.trim();
  return raw ? raw : null;
}

export type PipelineJobContext = {
  id: string;
  document_id: string;
  pipeline_name: string;
  provider: PipelineProvider;
  stage: PipelineJobStage;
  external_job_id: string | null;
  config_yaml: string | null;
  error_message: string | null;
  document: {
    id: string;
    name: string;
    file_type: string;
    s3_key: string;
    file_hash: string;
    channel_id: string;
  };
  input_uri: string;
  s3_prefix: string;
  api_url: string;
};

export async function createPipelineJob(input: {
  documentId: string;
  pipelineName: string;
  provider: PipelineProvider;
  configYaml?: string | null;
  evalRunItemId?: string | null;
}): Promise<typeof appPipelineJobs.$inferSelect> {
  const [row] = await db
    .insert(appPipelineJobs)
    .values({
      documentId: input.documentId,
      pipelineName: input.pipelineName,
      provider: input.provider,
      stage: 'submitted',
      configYaml: snapshotConfigYaml(input.configYaml),
      evalRunItemId: input.evalRunItemId?.trim() || null,
    })
    .returning();
  return row!;
}

export async function getPipelineJobById(id: string): Promise<typeof appPipelineJobs.$inferSelect | null> {
  const [row] = await db.select().from(appPipelineJobs).where(eq(appPipelineJobs.id, id)).limit(1);
  return row ?? null;
}

export async function getLatestPipelineJobForDocument(
  documentId: string,
): Promise<typeof appPipelineJobs.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(appPipelineJobs)
    .where(eq(appPipelineJobs.documentId, documentId))
    .orderBy(desc(appPipelineJobs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getLatestPipelineJobsForDocuments(
  documentIds: string[],
): Promise<Map<string, typeof appPipelineJobs.$inferSelect>> {
  if (documentIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(appPipelineJobs)
    .where(inArray(appPipelineJobs.documentId, documentIds))
    .orderBy(desc(appPipelineJobs.createdAt));

  const map = new Map<string, typeof appPipelineJobs.$inferSelect>();
  for (const row of rows) {
    if (!map.has(row.documentId)) map.set(row.documentId, row);
  }
  return map;
}

export function pipelineJobToPublic(job: typeof appPipelineJobs.$inferSelect) {
  return {
    id: job.id,
    stage: job.stage,
    pipeline_name: job.pipelineName,
    error_message: job.errorMessage,
    external_job_id: job.externalJobId,
    updated_at: job.updatedAt.toISOString(),
  };
}

export async function updatePipelineJob(
  id: string,
  input: {
    stage?: PipelineJobStage;
    externalJobId?: string | null;
    errorMessage?: string | null;
  },
): Promise<typeof appPipelineJobs.$inferSelect | null> {
  const [row] = await db
    .update(appPipelineJobs)
    .set({
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.externalJobId !== undefined ? { externalJobId: input.externalJobId } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appPipelineJobs.id, id))
    .returning();
  return row ?? null;
}

export async function listSubmittedJobs(provider?: PipelineProvider): Promise<typeof appPipelineJobs.$inferSelect[]> {
  return db
    .select()
    .from(appPipelineJobs)
    .where(eq(appPipelineJobs.stage, 'submitted'));
}

export async function buildPipelineJobContext(jobId: string): Promise<PipelineJobContext> {
  const job = await getPipelineJobById(jobId);
  if (!job) throw new Error('Pipeline job not found');

  const [doc] = await db.select().from(appDocuments).where(eq(appDocuments.id, job.documentId)).limit(1);
  if (!doc) throw new Error('Document not found');

  const s3 = getS3Config();
  if (!s3) throw new Error('Object storage is not configured');

  const channel = await getChannelById(doc.channelId);
  if (!channel) throw new Error('Channel not found');

  const apiUrl =
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`;

  let inputUri = `s3://${s3.bucket}/${doc.s3Key}`;
  let s3Prefix = s3PrefixFromKey(doc.s3Key);
  let displayName = doc.name;

  if (job.evalRunItemId) {
    const { buildEvalLinkedDocumentPipelineContextOverrides } = await import(
      '../eval/eval-document-bridge.ts'
    );
    const overrides = await buildEvalLinkedDocumentPipelineContextOverrides(job.evalRunItemId);
    if (overrides) {
      inputUri = overrides.input_uri;
      s3Prefix = overrides.s3_prefix;
      displayName = overrides.dataset_item_name;
    }
  }

  return {
    id: job.id,
    document_id: doc.id,
    pipeline_name: job.pipelineName,
    provider: job.provider as PipelineProvider,
    stage: job.stage as PipelineJobStage,
    external_job_id: job.externalJobId,
    config_yaml: job.configYaml ?? null,
    error_message: job.errorMessage,
    document: {
      id: doc.id,
      name: displayName,
      file_type: doc.fileType,
      s3_key: doc.s3Key,
      file_hash: doc.fileHash,
      channel_id: doc.channelId,
    },
    input_uri: inputUri,
    s3_prefix: s3Prefix,
    api_url: apiUrl,
  };
}

export async function markDocumentForJobStage(
  documentId: string,
  stage: PipelineJobStage,
): Promise<void> {
  if (stage === 'done') {
    await db
      .update(appDocuments)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(appDocuments.id, documentId));
    return;
  }
  if (stage === 'failed') {
    await db
      .update(appDocuments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(appDocuments.id, documentId));
    return;
  }
  await db
    .update(appDocuments)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(appDocuments.id, documentId));
}
