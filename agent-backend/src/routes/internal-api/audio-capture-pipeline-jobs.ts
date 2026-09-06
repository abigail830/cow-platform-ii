import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  buildDocumentCapturePipelineJobContext,
  getDocumentCapturePipelineJobById,
  markDocumentCaptureForJobStage,
  updateDocumentCapturePipelineJob,
} from '../../services/documents/document-capture-pipeline-jobs.ts';
import type { CapturePipelineJobStage } from '../../db/index.ts';
import { spawnDocumentCapturePostProcessWorker } from '../../services/documents/document-capture-pipeline-runner.ts';

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
  }>();

  const documentJob = await getDocumentCapturePipelineJobById(id);
  if (!documentJob) return c.json({ error: 'Capture pipeline job not found' }, 404);

  const updated = await updateDocumentCapturePipelineJob(documentJob.id, {
    stage: body.stage,
    errorMessage: body.error_message,
  });

  if (body.stage) {
    await markDocumentCaptureForJobStage(documentJob.captureId, body.stage);
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
