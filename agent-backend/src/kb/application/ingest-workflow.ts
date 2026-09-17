import { and, eq, sql } from 'drizzle-orm';
import {
  appDocumentCaptureSegments,
  appDocumentCaptures,
  appKnowledgeIngestWorkflowItems,
  appKnowledgeIngestWorkflows,
  appWebhookSubscriptions,
  db,
  type IngestWorkflowFileState,
  type IngestWorkflowIndexContent,
  type IngestWorkflowItemStatus,
  type IngestWorkflowJobRefs,
  type IngestWorkflowRetryConfig,
  type IngestWorkflowStatus,
  type IngestWorkflowStep,
} from '../../infrastructure/db/index.ts';
import { deliverWebhookEvent } from '../../infrastructure/webhook/deliver.ts';
import { generateWebhookSecret } from '../../infrastructure/webhook/webhook-sign.ts';
import { assertSafeWebhookUrl } from '../../infrastructure/webhook/webhook-url.ts';
import { createDocumentCapture } from '../../document/application/document-captures.ts';
import {
  completeDocumentCaptureAudioSegmentDirectUpload,
  completeDocumentCaptureSegmentDirectUpload,
  completeDocumentCaptureTranscriptSegmentDirectUpload,
  initDocumentCaptureAudioSegmentUpload,
  initDocumentCaptureSegmentUpload,
} from '../../document/application/document-capture-upload.ts';
import { transcriptS3Key, getStorageUploadUrl as getAudioUploadUrl } from '../../audio/infrastructure/audio-files.ts';
import { getChannelById } from '../../document/application/documents.ts';
import { resolveCaptureLibraryDocumentId } from '../../document/domain/capture/capture-library-document.ts';
import { getKnowledgeBaseById } from './knowledge-bases.ts';
import {
  detectIngestFileType,
  resolveIndexContentAudio,
  titleFromFilename,
} from '../domain/ingest-detect-type.ts';
import { deriveWorkflowStatus } from '../domain/ingest-workflow-status.ts';
import { getLatestPipelineJobForSegment } from '../../pipeline/application/pipeline-jobs.ts';
import { getLatestAudioPipelineJobsForDocumentCaptureSegments } from '../../audio/application/audio-pipeline-jobs.ts';
import { getLatestDocumentCapturePipelineJob } from '../../document/application/document-capture-pipeline-jobs.ts';
import { retryFailedJob } from '../../pipeline/application/async-job-retry.ts';

export { deriveWorkflowStatus };

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

async function findWorkflowByIdempotency(createdBy: string, idempotencyKey: string) {
  const [existing] = await db
    .select()
    .from(appKnowledgeIngestWorkflows)
    .where(
      and(
        eq(appKnowledgeIngestWorkflows.createdBy, createdBy),
        eq(appKnowledgeIngestWorkflows.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return existing ?? null;
}

const MAX_FILES = 100;

export type CreateIngestWorkflowInput = {
  channelId: string;
  knowledgeBaseId: string;
  knowledgeBaseType?: string;
  files: Array<{
    client_ref: string;
    filename: string;
    file_hash: string;
    size_bytes: number;
    content_type?: string;
    type?: string;
  }>;
  steps?: IngestWorkflowStep[];
  indexContentAudio?: string;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  signatureMode?: 'hmac_sha256' | 'none';
  indexMode?: 'batch' | 'per_item';
  retry?: { max_attempts?: number; auto_retry?: boolean };
  uploadDeadlineHours?: number;
  idempotencyKey?: string | null;
  createdBy: string;
};

function mergeJobRefs(
  existing: IngestWorkflowJobRefs | null | undefined,
  patch: IngestWorkflowJobRefs,
): IngestWorkflowJobRefs {
  const audio = [...(existing?.audio_job_ids ?? [])];
  for (const id of patch.audio_job_ids ?? []) {
    if (!audio.includes(id)) audio.push(id);
  }
  return {
    ...existing,
    ...patch,
    audio_job_ids: audio.length > 0 ? audio : existing?.audio_job_ids,
  };
}

export async function emitIngestWebhook(
  workflowId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const workflow = await getIngestWorkflowRow(workflowId);
  if (!workflow?.webhookSubscriptionId) return;
  await deliverWebhookEvent({
    subscriptionId: workflow.webhookSubscriptionId,
    event,
    payload: { ...payload, workflow_id: workflowId },
  });
}

export async function getIngestWorkflowRow(id: string) {
  const [row] = await db
    .select()
    .from(appKnowledgeIngestWorkflows)
    .where(eq(appKnowledgeIngestWorkflows.id, id))
    .limit(1);
  return row ?? null;
}

export async function listIngestWorkflowItems(workflowId: string) {
  return db
    .select()
    .from(appKnowledgeIngestWorkflowItems)
    .where(eq(appKnowledgeIngestWorkflowItems.workflowId, workflowId));
}

export async function findIngestItemByCaptureId(captureId: string) {
  const [row] = await db
    .select()
    .from(appKnowledgeIngestWorkflowItems)
    .where(eq(appKnowledgeIngestWorkflowItems.captureId, captureId))
    .limit(1);
  return row ?? null;
}

export async function findIngestItemByImportJobId(jobId: string) {
  return db
    .select()
    .from(appKnowledgeIngestWorkflowItems)
    .where(sql`${appKnowledgeIngestWorkflowItems.jobRefs}->>'import_job_id' = ${jobId}`);
}

export async function updateIngestItem(
  itemId: string,
  patch: {
    status?: IngestWorkflowItemStatus;
    step?: IngestWorkflowStep;
    documentId?: string | null;
    files?: IngestWorkflowFileState[];
    jobRefs?: IngestWorkflowJobRefs;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) {
  const [row] = await db
    .update(appKnowledgeIngestWorkflowItems)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.step !== undefined ? { step: patch.step } : {}),
      ...(patch.documentId !== undefined ? { documentId: patch.documentId } : {}),
      ...(patch.files !== undefined ? { files: patch.files } : {}),
      ...(patch.jobRefs !== undefined ? { jobRefs: patch.jobRefs } : {}),
      ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
      ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appKnowledgeIngestWorkflowItems.id, itemId))
    .returning();
  return row ?? null;
}

export async function updateIngestWorkflowStatus(
  workflowId: string,
  status: IngestWorkflowStatus,
  errorMessage?: string | null,
) {
  const [row] = await db
    .update(appKnowledgeIngestWorkflows)
    .set({
      status,
      ...(errorMessage !== undefined ? { errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appKnowledgeIngestWorkflows.id, workflowId))
    .returning();
  return row ?? null;
}

export async function refreshWorkflowStatus(workflowId: string): Promise<IngestWorkflowStatus> {
  const items = await listIngestWorkflowItems(workflowId);
  const status = deriveWorkflowStatus(items);
  await updateIngestWorkflowStatus(workflowId, status);
  return status;
}

function itemSummary(items: Array<{ status: IngestWorkflowItemStatus }>) {
  return {
    total: items.length,
    pending_upload: items.filter((i) => i.status === 'pending_upload').length,
    uploaded: items.filter((i) => i.status === 'uploaded').length,
    running: items.filter((i) => i.status === 'running').length,
    completed: items.filter((i) => i.status === 'completed').length,
    failed: items.filter((i) => i.status === 'failed').length,
    cancelled: items.filter((i) => i.status === 'cancelled').length,
  };
}

async function initUploadForType(input: {
  detectedType: 'document' | 'audio' | 'transcript';
  filename: string;
  fileHash: string;
  sizeBytes: number;
  contentType?: string;
}) {
  if (input.detectedType === 'document') {
    return initDocumentCaptureSegmentUpload({
      filename: input.filename,
      fileHash: input.fileHash,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType,
    });
  }
  if (input.detectedType === 'audio') {
    return initDocumentCaptureAudioSegmentUpload({
      filename: input.filename,
      fileHash: input.fileHash,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType,
    });
  }
  const s3Key = transcriptS3Key(input.fileHash);
  const contentType = input.contentType?.trim() || 'text/markdown; charset=utf-8';
  const uploadUrl = await getAudioUploadUrl(s3Key, contentType);
  return {
    s3_key: s3Key,
    file_hash: input.fileHash,
    upload_url: uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
    skip_upload: false,
  };
}

export async function createIngestWorkflow(input: CreateIngestWorkflowInput) {
  const channel = await getChannelById(input.channelId);
  if (!channel) throw new Error('Channel not found');
  const kb = await getKnowledgeBaseById(input.knowledgeBaseId);
  if (!kb) throw new Error('Knowledge base not found');
  if ((input.knowledgeBaseType ?? 'rag') !== 'rag' || kb.type !== 'rag') {
    throw new Error('v1 workflows only support rag knowledge bases');
  }
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new Error('files is required');
  }
  if (input.files.length > MAX_FILES) {
    throw new Error(`files cannot exceed ${MAX_FILES}`);
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await findWorkflowByIdempotency(input.createdBy, idempotencyKey);
    if (existing) {
      return toWorkflowPublic(existing, await listIngestWorkflowItems(existing.id), {
        includeUpload: true,
      });
    }
  }

  const clientRefs = new Set<string>();
  const prepared = [];
  for (const file of input.files) {
    const ref = file.client_ref?.trim();
    if (!ref) throw new Error('client_ref is required');
    if (clientRefs.has(ref)) throw new Error(`duplicate client_ref: ${ref}`);
    clientRefs.add(ref);
    const extraGroup = (file as { capture_group?: unknown }).capture_group;
    if (typeof extraGroup === 'string' && extraGroup.trim()) {
      throw new Error('capture_group is not supported; this API is always 1 file = 1 capture');
    }
    prepared.push({
      file,
      detectedType: detectIngestFileType({
        filename: file.filename,
        explicitType: file.type,
      }),
    });
  }

  if (input.webhookUrl?.trim()) {
    assertSafeWebhookUrl(input.webhookUrl);
  }

  const steps = input.steps?.length
    ? input.steps
    : (['upload', 'process', 'index'] as IngestWorkflowStep[]);
  const indexContent: IngestWorkflowIndexContent = {
    audio: resolveIndexContentAudio(input.indexContentAudio),
  };
  const retryConfig: IngestWorkflowRetryConfig = {
    max_attempts: Math.min(Math.max(input.retry?.max_attempts ?? 2, 1), 10),
    auto_retry: input.retry?.auto_retry ?? true,
  };
  const uploadDeadlineHours = input.uploadDeadlineHours ?? 24;
  const uploadDeadlineAt = new Date(Date.now() + uploadDeadlineHours * 60 * 60 * 1000);

  let workflow;
  try {
    const [row] = await db
      .insert(appKnowledgeIngestWorkflows)
      .values({
        status: 'pending_upload',
        channelId: input.channelId,
        knowledgeBaseId: input.knowledgeBaseId,
        knowledgeBaseType: 'rag',
        steps,
        retryConfig,
        indexMode: input.indexMode === 'per_item' ? 'per_item' : 'batch',
        indexContent,
        uploadDeadlineAt,
        idempotencyKey,
        createdBy: input.createdBy,
      })
      .returning();
    workflow = row;
  } catch (error) {
    if (idempotencyKey && isUniqueViolation(error)) {
      const existing = await findWorkflowByIdempotency(input.createdBy, idempotencyKey);
      if (existing) {
        return toWorkflowPublic(existing, await listIngestWorkflowItems(existing.id), {
          includeUpload: true,
        });
      }
    }
    throw error;
  }

  let webhookSecret: string | null = null;
  if (input.webhookUrl?.trim()) {
    const url = assertSafeWebhookUrl(input.webhookUrl);
    webhookSecret = input.webhookSecret?.trim() || generateWebhookSecret();
    const [sub] = await db
      .insert(appWebhookSubscriptions)
      .values({
        ownerType: 'ingest_workflow',
        ownerId: workflow!.id,
        url,
        secret: webhookSecret,
        signatureMode: input.signatureMode === 'none' ? 'none' : 'hmac_sha256',
      })
      .returning();
    await db
      .update(appKnowledgeIngestWorkflows)
      .set({ webhookSubscriptionId: sub!.id, updatedAt: new Date() })
      .where(eq(appKnowledgeIngestWorkflows.id, workflow!.id));
    workflow!.webhookSubscriptionId = sub!.id;
  }

  const publicItems = [];
  for (const { file, detectedType } of prepared) {
    const upload = await initUploadForType({
      detectedType,
      filename: file.filename,
      fileHash: file.file_hash,
      sizeBytes: file.size_bytes,
      contentType: file.content_type,
    });
    const signedContentType = upload.headers['Content-Type'] || file.content_type;
    const capture = await createDocumentCapture({
      channelId: input.channelId,
      title: titleFromFilename(file.filename),
      inputMode: detectedType,
      createdBy: input.createdBy,
    });
    const files: IngestWorkflowFileState[] = [
      {
        client_ref: file.client_ref.trim(),
        filename: file.filename,
        file_hash: file.file_hash,
        size_bytes: file.size_bytes,
        content_type: signedContentType,
        s3_key: upload.s3_key,
        upload_status: 'awaiting_put',
      },
    ];
    const [item] = await db
      .insert(appKnowledgeIngestWorkflowItems)
      .values({
        workflowId: workflow!.id,
        clientRef: file.client_ref.trim(),
        detectedType,
        status: 'pending_upload',
        step: 'upload',
        captureId: capture.id,
        files,
        jobRefs: {},
      })
      .returning();
    await db
      .update(appDocumentCaptures)
      .set({
        metadata: {
          ingest_workflow_id: workflow!.id,
          ingest_workflow_item_id: item!.id,
          index_content: indexContent,
        },
        updatedAt: new Date(),
      })
      .where(eq(appDocumentCaptures.id, capture.id));

    publicItems.push({
      item_id: item!.id,
      client_ref: item!.clientRef,
      detected_type: detectedType,
      status: item!.status,
      step: item!.step,
      files: [
        {
          client_ref: file.client_ref.trim(),
          status: 'awaiting_put',
          upload: {
            upload_url: upload.upload_url,
            s3_key: upload.s3_key,
            method: 'PUT' as const,
            headers: upload.headers,
          },
        },
      ],
      platform_refs: { capture_id: capture.id, document_id: null },
    });
  }

  return {
    workflow_id: workflow!.id,
    status: 'pending_upload' as const,
    webhook_secret: webhookSecret,
    upload_deadline_at: uploadDeadlineAt.toISOString(),
    items: publicItems,
  };
}

async function libraryDocumentIdForSegment(segmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ metadata: appDocumentCaptureSegments.metadata })
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.id, segmentId))
    .limit(1);
  return resolveCaptureLibraryDocumentId((row?.metadata as Record<string, unknown>) ?? {});
}

async function recordJobsAfterAttach(
  item: typeof appKnowledgeIngestWorkflowItems.$inferSelect,
  segmentId: string,
) {
  const parseJob = await getLatestPipelineJobForSegment(segmentId);
  const audioJobs = await getLatestAudioPipelineJobsForDocumentCaptureSegments([segmentId]);
  const audioJob = audioJobs.get(segmentId);
  const captureJob = await getLatestDocumentCapturePipelineJob(item.captureId);
  return mergeJobRefs(item.jobRefs, {
    parse_job_id: parseJob?.id,
    audio_job_ids: audioJob?.id ? [audioJob.id] : [],
    capture_job_id: captureJob?.id,
  });
}

export async function confirmIngestWorkflowUploads(input: {
  workflowId: string;
  createdBy: string;
  files: Array<{
    client_ref?: string;
    item_id?: string;
    s3_key: string;
    file_hash: string;
    size_bytes: number;
  }>;
}) {
  const workflow = await getIngestWorkflowRow(input.workflowId);
  if (!workflow) throw new Error('Workflow not found');
  if (workflow.status === 'cancelled') throw new Error('Workflow is cancelled');
  if (!input.files.length) throw new Error('items is required');

  const allItems = await listIngestWorkflowItems(workflow.id);
  const updatedIds: string[] = [];

  for (const file of input.files) {
    const item = allItems.find((row) => {
      if (file.item_id && row.id === file.item_id) return true;
      return row.files.some((f) => f.client_ref === file.client_ref);
    });
    if (!item) throw new Error(`Unknown file ${file.client_ref ?? file.item_id}`);
    const fileState = item.files.find((f) =>
      file.client_ref ? f.client_ref === file.client_ref : true,
    );
    if (!fileState) throw new Error(`Unknown file ${file.client_ref ?? file.item_id}`);

    if (fileState.upload_status === 'uploaded') {
      if (fileState.s3_key === file.s3_key && fileState.file_hash === file.file_hash) {
        updatedIds.push(item.id);
        continue;
      }
      throw new Error(`File ${fileState.client_ref} is already uploaded`);
    }
    if (fileState.s3_key && file.s3_key !== fileState.s3_key) {
      throw new Error('s3_key does not match upload-init');
    }

    let segment;
    if (item.detectedType === 'document') {
      segment = await completeDocumentCaptureSegmentDirectUpload({
        channelId: workflow.channelId,
        captureId: item.captureId,
        filename: fileState.filename,
        fileHash: file.file_hash,
        s3Key: file.s3_key,
        sizeBytes: file.size_bytes,
        uploadedBy: input.createdBy,
      });
    } else if (item.detectedType === 'audio') {
      segment = await completeDocumentCaptureAudioSegmentDirectUpload({
        channelId: workflow.channelId,
        captureId: item.captureId,
        filename: fileState.filename,
        fileHash: file.file_hash,
        s3Key: file.s3_key,
        sizeBytes: file.size_bytes,
        uploadedBy: input.createdBy,
      });
    } else {
      segment = await completeDocumentCaptureTranscriptSegmentDirectUpload({
        channelId: workflow.channelId,
        captureId: item.captureId,
        filename: fileState.filename,
        fileHash: file.file_hash,
        transcriptS3Key: file.s3_key,
        sizeBytes: file.size_bytes,
        uploadedBy: input.createdBy,
      });
    }

    const files = item.files.map((f) =>
      f.client_ref === fileState.client_ref
        ? {
            ...f,
            s3_key: file.s3_key,
            file_hash: file.file_hash,
            size_bytes: file.size_bytes,
            segment_id: segment.id,
            upload_status: 'uploaded' as const,
          }
        : f,
    );
    const jobRefs = await recordJobsAfterAttach(item, segment.id);
    const nextStep: IngestWorkflowStep = workflow.steps.includes('process') ? 'process' : 'index';
    const documentId =
      item.detectedType === 'document' && !jobRefs.parse_job_id
        ? await libraryDocumentIdForSegment(segment.id)
        : undefined;
    await updateIngestItem(item.id, {
      status: 'running',
      step: nextStep,
      files,
      jobRefs,
      ...(documentId ? { documentId } : {}),
      errorCode: null,
      errorMessage: null,
    });
    updatedIds.push(item.id);
    await emitIngestWebhook(workflow.id, 'workflow.item.uploaded', {
      item: { item_id: item.id, client_ref: item.clientRef, file: { client_ref: fileState.client_ref } },
    });
  }

  const { maybeAdvanceIngestWorkflow } = await import('./ingest-workflow-dispatch.ts');
  await maybeAdvanceIngestWorkflow(workflow.id);
  const refreshed = await listIngestWorkflowItems(workflow.id);
  const status = await refreshWorkflowStatus(workflow.id);
  return {
    workflow_id: workflow.id,
    status,
    items: refreshed
      .filter((row) => updatedIds.includes(row.id))
      .map((row) => ({
        item_id: row.id,
        client_ref: row.clientRef,
        status: row.status,
        step: row.step,
      })),
    summary: itemSummary(refreshed),
  };
}

export async function getIngestWorkflowPublic(workflowId: string) {
  const workflow = await getIngestWorkflowRow(workflowId);
  if (!workflow) return null;
  try {
    const { reconcileIngestWorkflowFromJobs } = await import('./ingest-workflow-dispatch.ts');
    await reconcileIngestWorkflowFromJobs(workflowId);
  } catch (error) {
    console.error(`[ingest-workflow] reconcile failed for ${workflowId}:`, error);
  }
  const latest = await getIngestWorkflowRow(workflowId);
  const items = await listIngestWorkflowItems(workflowId);
  return toWorkflowPublic(latest ?? workflow, items, { includeUpload: false });
}

async function toWorkflowPublic(
  workflow: typeof appKnowledgeIngestWorkflows.$inferSelect,
  items: Array<typeof appKnowledgeIngestWorkflowItems.$inferSelect>,
  options: { includeUpload: boolean },
) {
  return {
    workflow_id: workflow.id,
    status: workflow.status,
    channel_id: workflow.channelId,
    knowledge_base_id: workflow.knowledgeBaseId,
    upload_deadline_at: workflow.uploadDeadlineAt?.toISOString() ?? null,
    index_mode: workflow.indexMode,
    items: await Promise.all(items.map((item) => toItemPublic(item, options))),
    summary: itemSummary(items),
  };
}

async function toItemPublic(
  item: typeof appKnowledgeIngestWorkflowItems.$inferSelect,
  options: { includeUpload: boolean },
) {
  const captureJob = await getLatestDocumentCapturePipelineJob(item.captureId);
  const segmentIds = item.files.map((f) => f.segment_id).filter((id): id is string => Boolean(id));
  const parseJob = segmentIds[0] ? await getLatestPipelineJobForSegment(segmentIds[0]) : null;
  const audioJobs = await getLatestAudioPipelineJobsForDocumentCaptureSegments(segmentIds);
  const audioJob = segmentIds[0] ? audioJobs.get(segmentIds[0]) : undefined;
  const substage =
    item.step === 'index'
      ? item.status
      : captureJob?.stage ?? audioJob?.stage ?? parseJob?.stage ?? item.status;

  const files = await Promise.all(
    item.files.map(async (file) => {
      const base = {
        client_ref: file.client_ref,
        filename: file.filename,
        status: file.upload_status,
        s3_key: file.s3_key,
      };
      if (!options.includeUpload || file.upload_status !== 'awaiting_put' || !file.s3_key) {
        return base;
      }
      const contentType = file.content_type || 'application/octet-stream';
      const uploadUrl = await getAudioUploadUrl(file.s3_key, contentType);
      return {
        ...base,
        upload: {
          upload_url: uploadUrl,
          s3_key: file.s3_key,
          method: 'PUT' as const,
          headers: { 'Content-Type': contentType },
        },
      };
    }),
  );

  return {
    item_id: item.id,
    client_ref: item.clientRef,
    detected_type: item.detectedType,
    status: item.status,
    step: item.step,
    substage,
    files,
    platform_refs: {
      capture_id: item.captureId,
      document_id: item.documentId,
    },
    error_code: item.errorCode,
    error_message: item.errorMessage,
  };
}

export async function cancelIngestWorkflow(workflowId: string) {
  const workflow = await getIngestWorkflowRow(workflowId);
  if (!workflow) throw new Error('Workflow not found');
  const items = await listIngestWorkflowItems(workflowId);
  for (const item of items) {
    if (item.status === 'pending_upload' || item.status === 'uploaded') {
      await updateIngestItem(item.id, { status: 'cancelled', errorCode: 'CANCELLED' });
    }
  }
  const status = await refreshWorkflowStatus(workflowId);
  await emitIngestWebhook(workflowId, 'workflow.cancelled', { status });
  return getIngestWorkflowPublic(workflowId);
}

export async function retryIngestWorkflowItem(workflowId: string, itemId: string) {
  const item = (await listIngestWorkflowItems(workflowId)).find((row) => row.id === itemId);
  if (!item) throw new Error('Item not found');
  if (item.status !== 'failed') throw new Error('Item is not failed');
  const workflow = await getIngestWorkflowRow(workflowId);
  if (!workflow) throw new Error('Workflow not found');
  const policy = {
    maxAttempts: workflow.retryConfig.max_attempts,
    autoRetry: true,
  };

  if (item.jobRefs.import_job_id) {
    const result = await retryFailedJob('kb_import', item.jobRefs.import_job_id, policy);
    if (result.retried) {
      await updateIngestItem(item.id, { status: 'running', step: 'index', errorCode: null, errorMessage: null });
      await refreshWorkflowStatus(workflowId);
      return { retried: true, domain: 'kb_import' };
    }
  }
  if (item.jobRefs.capture_job_id) {
    const result = await retryFailedJob('capture_pipeline', item.jobRefs.capture_job_id, policy);
    if (result.retried) {
      await updateIngestItem(item.id, { status: 'running', step: 'process', errorCode: null, errorMessage: null });
      await refreshWorkflowStatus(workflowId);
      return { retried: true, domain: 'capture_pipeline' };
    }
  }
  if (item.jobRefs.parse_job_id) {
    const result = await retryFailedJob('document_pipeline', item.jobRefs.parse_job_id, policy);
    if (result.retried) {
      await updateIngestItem(item.id, { status: 'running', step: 'process', errorCode: null, errorMessage: null });
      await refreshWorkflowStatus(workflowId);
      return { retried: true, domain: 'document_pipeline' };
    }
  }
  const audioId = item.jobRefs.audio_job_ids?.[0];
  if (audioId) {
    const result = await retryFailedJob('audio_pipeline', audioId, policy);
    if (result.retried) {
      await updateIngestItem(item.id, { status: 'running', step: 'process', errorCode: null, errorMessage: null });
      await refreshWorkflowStatus(workflowId);
      return { retried: true, domain: 'audio_pipeline' };
    }
  }
  throw new Error('No failed job to retry');
}
