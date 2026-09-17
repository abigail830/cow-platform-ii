import { eq } from 'drizzle-orm';
import {
  appDocumentCaptureSegments,
  appDocumentCaptures,
  db,
  type IngestWorkflowJobRefs,
} from '../../infrastructure/db/index.ts';
import { resolveCaptureLibraryDocumentId } from '../../document/domain/capture/capture-library-document.ts';
import { startKbRagIndexImport, getKbImportJobById, updateKbImportJob } from './knowledge-bases.ts';
import { spawnKbImportWorker } from '../infrastructure/kb-import-runner.ts';
import { retryFailedJob } from '../../pipeline/application/async-job-retry.ts';
import { getPipelineJobById, getLatestPipelineJobForSegment } from '../../pipeline/application/pipeline-jobs.ts';
import {
  getAudioPipelineJobById,
  getLatestAudioPipelineJobsForDocumentCaptureSegments,
} from '../../audio/application/audio-pipeline-jobs.ts';
import {
  getDocumentCapturePipelineJobById,
  getLatestDocumentCapturePipelineJob,
  reconcileStaleDocumentCapturePipelineJob,
} from '../../document/application/document-capture-pipeline-jobs.ts';
import {
  emitIngestWebhook,
  findIngestItemByCaptureId,
  findIngestItemByImportJobId,
  getIngestWorkflowRow,
  listIngestWorkflowItems,
  refreshWorkflowStatus,
  updateIngestItem,
} from './ingest-workflow.ts';

function isTerminalItemStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function libraryDocumentIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  if (typeof metadata.library_document_id === 'string' && metadata.library_document_id.trim()) {
    return metadata.library_document_id.trim();
  }
  return null;
}

async function captureIdFromSegment(segmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ captureId: appDocumentCaptureSegments.captureId })
    .from(appDocumentCaptureSegments)
    .where(eq(appDocumentCaptureSegments.id, segmentId))
    .limit(1);
  return row?.captureId ?? null;
}

async function mergeItemJobRefs(
  itemId: string,
  existing: IngestWorkflowJobRefs,
  patch: IngestWorkflowJobRefs,
) {
  const audio = [...(existing.audio_job_ids ?? [])];
  for (const id of patch.audio_job_ids ?? []) {
    if (!audio.includes(id)) audio.push(id);
  }
  const jobRefs: IngestWorkflowJobRefs = {
    ...existing,
    ...patch,
    audio_job_ids: audio.length ? audio : existing.audio_job_ids,
  };
  await updateIngestItem(itemId, { jobRefs });
  return jobRefs;
}

async function failItem(
  workflowId: string,
  itemId: string,
  code: string,
  message: string,
  jobRefs?: IngestWorkflowJobRefs,
) {
  const item = await updateIngestItem(itemId, {
    status: 'failed',
    errorCode: code,
    errorMessage: message.slice(0, 2000),
    ...(jobRefs ? { jobRefs } : {}),
  });
  await emitIngestWebhook(workflowId, 'workflow.item.failed', {
    item: {
      item_id: itemId,
      client_ref: item?.clientRef,
      status: 'failed',
    },
    failure: { code, reason: message, retryable: true },
  });
  await maybeAdvanceIngestWorkflow(workflowId);
}

async function jobIsFailed(
  domain: Parameters<typeof retryFailedJob>[0],
  jobId: string,
): Promise<boolean> {
  switch (domain) {
    case 'document_pipeline':
      return (await getPipelineJobById(jobId))?.stage === 'failed';
    case 'audio_pipeline':
      return (await getAudioPipelineJobById(jobId))?.stage === 'failed';
    case 'capture_pipeline':
      return (await getDocumentCapturePipelineJobById(jobId))?.stage === 'failed';
    case 'kb_import':
      return (await getKbImportJobById(jobId))?.status === 'failed';
    default:
      return false;
  }
}

async function maybeAutoRetry(
  workflowId: string,
  itemId: string,
  domain: Parameters<typeof retryFailedJob>[0],
  jobId: string,
): Promise<boolean> {
  if (!(await jobIsFailed(domain, jobId))) return true;
  const workflow = await getIngestWorkflowRow(workflowId);
  if (!workflow?.retryConfig.auto_retry) return false;
  const result = await retryFailedJob(domain, jobId, {
    maxAttempts: workflow.retryConfig.max_attempts,
    autoRetry: true,
  });
  if (result.reason === 'not_failed') return true;
  if (!result.retried) return false;
  await updateIngestItem(itemId, {
    status: 'running',
    errorCode: null,
    errorMessage: null,
  });
  await emitIngestWebhook(workflowId, 'workflow.item.retrying', {
    item: { item_id: itemId },
    pipeline: { job_id: jobId, domain },
  });
  await refreshWorkflowStatus(workflowId);
  return true;
}

export async function maybeAdvanceIngestWorkflow(workflowId: string): Promise<void> {
  const workflow = await getIngestWorkflowRow(workflowId);
  if (!workflow || workflow.status === 'cancelled') return;
  const items = await listIngestWorkflowItems(workflowId);
  const previousStatus = workflow.status;
  const processDone = items.filter(
    (i) => i.documentId && i.status === 'running' && i.step === 'process',
  );

  const includeIndex = workflow.steps.includes('index');

  for (const item of processDone) {
    if (!includeIndex) {
      await updateIngestItem(item.id, { status: 'completed', step: 'process' });
      await emitIngestWebhook(workflowId, 'workflow.item.completed', {
        item: { item_id: item.id, client_ref: item.clientRef },
      });
      continue;
    }
    if (workflow.indexMode === 'per_item' && item.documentId && !item.jobRefs.import_job_id) {
      await startIndexForDocuments(workflowId, workflow.knowledgeBaseId, workflow.createdBy, [item.id]);
    } else if (workflow.indexMode === 'batch') {
      await updateIngestItem(item.id, { step: 'index' });
    }
  }

  const after = await listIngestWorkflowItems(workflowId);
  if (includeIndex && workflow.indexMode === 'batch') {
    const stillProcess = after.some(
      (i) =>
        i.status === 'pending_upload' ||
        i.status === 'uploaded' ||
        (i.status === 'running' && i.step === 'process'),
    );
    const awaitingIndex = after.filter(
      (i) => i.status === 'running' && i.step === 'index' && i.documentId && !i.jobRefs.import_job_id,
    );
    if (!stillProcess && awaitingIndex.length > 0) {
      await startIndexForDocuments(
        workflowId,
        workflow.knowledgeBaseId,
        workflow.createdBy,
        awaitingIndex.map((i) => i.id),
      );
    }
  }

  const status = await refreshWorkflowStatus(workflowId);
  if (
    status !== previousStatus &&
    (status === 'completed' || status === 'partially_completed' || status === 'failed')
  ) {
    await emitIngestWebhook(workflowId, `workflow.${status}`, { status });
  }
}

async function startIndexForDocuments(
  workflowId: string,
  knowledgeBaseId: string,
  createdBy: string | null,
  itemIds: string[],
) {
  const items = await listIngestWorkflowItems(workflowId);
  const selected = items.filter((i) => itemIds.includes(i.id) && i.documentId);
  const documentIds = selected.map((i) => i.documentId!).filter(Boolean);
  if (documentIds.length === 0) return;

  const result = await startKbRagIndexImport({
    knowledgeBaseId,
    documentIds,
    createdBy,
  });
  for (const item of selected) {
    await updateIngestItem(item.id, {
      step: 'index',
      status: 'running',
      jobRefs: { ...item.jobRefs, import_job_id: result.job.id },
    });
  }
  try {
    await spawnKbImportWorker(result.job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Index worker did not start';
    await updateKbImportJob(result.job.id, { status: 'failed', errorMessage: message.slice(0, 2000) });
    for (const item of selected) {
      await failItem(workflowId, item.id, 'INDEX_FAILED', message, {
        ...item.jobRefs,
        import_job_id: result.job.id,
      });
    }
  }
}

export async function onIngestDocumentPipelinePatch(input: {
  jobId: string;
  stage: string;
  errorMessage?: string | null;
  documentCaptureSegmentId?: string | null;
}): Promise<void> {
  if (!input.documentCaptureSegmentId) return;
  const captureId = await captureIdFromSegment(input.documentCaptureSegmentId);
  if (!captureId) return;
  const item = await findIngestItemByCaptureId(captureId);
  if (!item || isTerminalItemStatus(item.status)) return;

  const jobRefs = await mergeItemJobRefs(item.id, item.jobRefs, { parse_job_id: input.jobId });
  await emitIngestWebhook(item.workflowId, 'workflow.item.progress', {
    item: { item_id: item.id, client_ref: item.clientRef, step: 'process', substage: input.stage },
    pipeline: { name: 'document_pipeline', job_id: input.jobId, stage: input.stage },
  });

  if (input.stage === 'failed') {
    const retried = await maybeAutoRetry(item.workflowId, item.id, 'document_pipeline', input.jobId);
    if (!retried) {
      await failItem(item.workflowId, item.id, 'PROVIDER_ERROR', input.errorMessage || 'Parse failed', jobRefs);
    }
    return;
  }

  if (input.stage === 'done') {
    const [segment] = await db
      .select({ metadata: appDocumentCaptureSegments.metadata })
      .from(appDocumentCaptureSegments)
      .where(eq(appDocumentCaptureSegments.id, input.documentCaptureSegmentId))
      .limit(1);
    const documentId = libraryDocumentIdFromMetadata(segment?.metadata as Record<string, unknown>);
    if (!documentId) {
      await failItem(item.workflowId, item.id, 'MARKDOWN_MISSING', 'Parse finished without a library document', jobRefs);
      return;
    }
    await updateIngestItem(item.id, {
      documentId,
      status: 'running',
      step: 'process',
      jobRefs,
    });
    await maybeAdvanceIngestWorkflow(item.workflowId);
  }
}

export async function onIngestAudioPipelinePatch(input: {
  jobId: string;
  stage: string;
  errorMessage?: string | null;
  documentCaptureSegmentId?: string | null;
}): Promise<void> {
  if (!input.documentCaptureSegmentId) return;
  const captureId = await captureIdFromSegment(input.documentCaptureSegmentId);
  if (!captureId) return;
  const item = await findIngestItemByCaptureId(captureId);
  if (!item || isTerminalItemStatus(item.status)) return;

  await mergeItemJobRefs(item.id, item.jobRefs, { audio_job_ids: [input.jobId] });
  await emitIngestWebhook(item.workflowId, 'workflow.item.progress', {
    item: { item_id: item.id, client_ref: item.clientRef, step: 'process', substage: input.stage },
    pipeline: { name: 'audio_pipeline', job_id: input.jobId, stage: input.stage },
  });

  if (input.stage === 'failed') {
    const retried = await maybeAutoRetry(item.workflowId, item.id, 'audio_pipeline', input.jobId);
    if (!retried) {
      await failItem(item.workflowId, item.id, 'ASR_FAILED', input.errorMessage || 'Transcription failed');
    }
  }
}

export async function onIngestCapturePipelinePatch(input: {
  jobId: string;
  stage: string;
  errorMessage?: string | null;
  captureId: string;
}): Promise<void> {
  const item = await findIngestItemByCaptureId(input.captureId);
  if (!item || isTerminalItemStatus(item.status)) return;

  const jobRefs = await mergeItemJobRefs(item.id, item.jobRefs, { capture_job_id: input.jobId });
  await emitIngestWebhook(item.workflowId, 'workflow.item.progress', {
    item: { item_id: item.id, client_ref: item.clientRef, step: 'process', substage: input.stage },
    pipeline: { name: 'capture_pipeline', job_id: input.jobId, stage: input.stage },
  });

  if (input.stage === 'failed') {
    const retried = await maybeAutoRetry(item.workflowId, item.id, 'capture_pipeline', input.jobId);
    if (!retried) {
      await failItem(
        item.workflowId,
        item.id,
        'LLM_TIMEOUT',
        input.errorMessage || 'Post-process failed',
        jobRefs,
      );
    }
    return;
  }

  if (input.stage === 'done') {
    const [capture] = await db
      .select({ metadata: appDocumentCaptures.metadata })
      .from(appDocumentCaptures)
      .where(eq(appDocumentCaptures.id, input.captureId))
      .limit(1);
    const documentId = resolveCaptureLibraryDocumentId(capture?.metadata as Record<string, unknown>);
    if (!documentId) {
      await failItem(item.workflowId, item.id, 'MARKDOWN_MISSING', 'Post-process finished without a library document', jobRefs);
      return;
    }
    await updateIngestItem(item.id, {
      documentId,
      status: 'running',
      step: 'process',
      jobRefs,
    });
    await maybeAdvanceIngestWorkflow(item.workflowId);
  }
}

export async function onIngestKbImportPatch(input: {
  jobId: string;
  status: string;
  errorMessage?: string | null;
}): Promise<void> {
  const items = await findIngestItemByImportJobId(input.jobId);
  if (items.length === 0) return;
  const active = items.filter((item) => !isTerminalItemStatus(item.status));
  if (active.length === 0) return;
  const workflowId = active[0]!.workflowId;

  if (input.status === 'failed') {
    const retried = await maybeAutoRetry(workflowId, active[0]!.id, 'kb_import', input.jobId);
    if (!retried) {
      for (const item of active) {
        await failItem(workflowId, item.id, 'INDEX_FAILED', input.errorMessage || 'Index failed');
      }
    }
    return;
  }

  if (input.status === 'completed') {
    for (const item of active) {
      await updateIngestItem(item.id, { status: 'completed', step: 'index', errorCode: null, errorMessage: null });
      await emitIngestWebhook(workflowId, 'workflow.item.completed', {
        item: { item_id: item.id, client_ref: item.clientRef },
      });
    }
    await maybeAdvanceIngestWorkflow(workflowId);
  }
}

/** Catch up item status from job rows (GET is source of truth if a webhook/PATCH was missed). */
export async function reconcileIngestWorkflowFromJobs(workflowId: string): Promise<void> {
  const workflow = await getIngestWorkflowRow(workflowId);
  if (!workflow || workflow.status === 'cancelled') return;

  const items = await listIngestWorkflowItems(workflowId);
  for (const item of items) {
    if (item.status !== 'running' && item.status !== 'uploaded') continue;

    await reconcileStaleDocumentCapturePipelineJob(item.captureId);

    const current = (await listIngestWorkflowItems(workflowId)).find((row) => row.id === item.id);
    if (!current || isTerminalItemStatus(current.status)) continue;

    const captureJob = await getLatestDocumentCapturePipelineJob(item.captureId);
    if (captureJob && (captureJob.stage === 'done' || captureJob.stage === 'failed')) {
      await onIngestCapturePipelinePatch({
        jobId: captureJob.id,
        stage: captureJob.stage,
        errorMessage: captureJob.errorMessage,
        captureId: item.captureId,
      });
    }

    const segmentId = current.files.map((f) => f.segment_id).find((id): id is string => Boolean(id));
    if (segmentId) {
      const parseJob = await getLatestPipelineJobForSegment(segmentId);
      if (parseJob && (parseJob.stage === 'done' || parseJob.stage === 'failed')) {
        await onIngestDocumentPipelinePatch({
          jobId: parseJob.id,
          stage: parseJob.stage,
          errorMessage: parseJob.errorMessage,
          documentCaptureSegmentId: segmentId,
        });
      }
      const audioJobs = await getLatestAudioPipelineJobsForDocumentCaptureSegments([segmentId]);
      const audioJob = audioJobs.get(segmentId);
      if (audioJob?.stage === 'failed') {
        await onIngestAudioPipelinePatch({
          jobId: audioJob.id,
          stage: audioJob.stage,
          errorMessage: audioJob.errorMessage,
          documentCaptureSegmentId: segmentId,
        });
      }
    }

    const after = (await listIngestWorkflowItems(workflowId)).find((row) => row.id === item.id);
    if (!after?.jobRefs.import_job_id || isTerminalItemStatus(after.status)) continue;
    const importJob = await getKbImportJobById(after.jobRefs.import_job_id);
    if (importJob && (importJob.status === 'completed' || importJob.status === 'failed')) {
      await onIngestKbImportPatch({
        jobId: importJob.id,
        status: importJob.status,
        errorMessage: importJob.errorMessage,
      });
    }
  }
}
