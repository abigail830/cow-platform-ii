import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../infrastructure/http/route-param.ts';
import {
  buildDocumentCapturePipelineJobContext,
  getDocumentCapturePipelineJobById,
  markDocumentCaptureForJobStage,
  updateDocumentCapturePipelineJob,
} from '../../document/application/document-capture-pipeline-jobs.ts';
import type { CapturePipelineJobStage } from '../../infrastructure/db/index.ts';
import { spawnDocumentCapturePostProcessWorker } from '../../document/application/document-capture-pipeline-runner.ts';
import {
  maybeAutoRetryAfterFailed,
  resolveAsyncJobPatchMetrics,
} from '../../pipeline/application/async-job-retry.ts';
import type { AsyncJobMetrics } from '../../infrastructure/db/index.ts';

const audioCapturePipelineJobs = new Hono();

audioCapturePipelineJobs.use('*', requireCliInternalAuth);

audioCapturePipelineJobs.get('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Capture pipeline job id is required' }, 400);

  try {
    const documentJob = await getDocumentCapturePipelineJobById(id);
    if (!documentJob) return c.json({ error: 'Capture pipeline job not found' }, 404);
    const ctx = await buildDocumentCapturePipelineJobContext(id);
    return c.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load job';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

audioCapturePipelineJobs.patch('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Capture pipeline job id is required' }, 400);

  const body = await c.req.json<{
    stage?: CapturePipelineJobStage;
    error_message?: string | null;
    metrics?: Partial<AsyncJobMetrics> | Record<string, unknown> | null;
  }>();

  const documentJob = await getDocumentCapturePipelineJobById(id);
  if (!documentJob) return c.json({ error: 'Capture pipeline job not found' }, 404);

  const metrics = resolveAsyncJobPatchMetrics({
    domain: 'capture_pipeline',
    previousStage: documentJob.stage,
    existingMetrics: documentJob.metrics,
    newStage: body.stage,
    metricsPatch: body.metrics,
  });

  const updated = await updateDocumentCapturePipelineJob(documentJob.id, {
    stage: body.stage,
    errorMessage: body.error_message,
    ...(metrics !== undefined ? { metrics } : {}),
  });

  if (body.stage) {
    await markDocumentCaptureForJobStage(documentJob.captureId, body.stage);
  }

  if (body.stage === 'failed') {
    await maybeAutoRetryAfterFailed('capture_pipeline', documentJob.id);
  }

  return c.json({ ok: true, job: updated });
});

audioCapturePipelineJobs.post('/:id/events', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Capture pipeline job id is required' }, 400);

  const documentJob = await getDocumentCapturePipelineJobById(id);
  if (!documentJob) return c.json({ error: 'Capture pipeline job not found' }, 404);

  await spawnDocumentCapturePostProcessWorker(documentJob.id, documentJob.pipelineName);
  return c.json({ ok: true, status: 'worker_spawned' }, 202);
});

export default audioCapturePipelineJobs;
