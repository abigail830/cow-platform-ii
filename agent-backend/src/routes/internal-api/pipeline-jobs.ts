import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import {
  buildPipelineJobContext,
  getPipelineJobById,
  markDocumentForJobStage,
  updatePipelineJob,
  type PipelineJobStage,
} from '../../services/pipeline-jobs.ts';
import { spawnAsyncPipelineWorker } from '../../services/pipeline-runner.ts';

const pipelineJobs = new Hono();

/** Aliyun Document Mind event callback — provider cannot send CLI Basic auth. */
pipelineJobs.post('/:id/aliyun-callback', async (c) => {
  const job = await getPipelineJobById(c.req.param('id'));
  if (!job) return c.json({ error: 'Pipeline job not found' }, 404);

  let payload: Record<string, unknown> = {};
  try {
    payload = await c.req.json<Record<string, unknown>>();
  } catch {
    payload = {};
  }

  const externalId =
    (typeof payload.Id === 'string' && payload.Id) ||
    (typeof payload.id === 'string' && payload.id) ||
    (typeof payload.Data === 'object' &&
      payload.Data !== null &&
      typeof (payload.Data as { Id?: string }).Id === 'string' &&
      (payload.Data as { Id: string }).Id) ||
    job.externalJobId;

  if (job.stage !== 'submitted') {
    return c.json({ ok: true, skipped: true });
  }

  if (externalId) {
    await updatePipelineJob(job.id, { externalJobId: externalId });
  }

  await spawnAsyncPipelineWorker(job.id, job.pipelineName);
  return c.json({ ok: true, status: 'finalize_spawned' }, 202);
});

pipelineJobs.use('*', requireCliInternalAuth);

pipelineJobs.get('/:id', async (c) => {
  try {
    const ctx = await buildPipelineJobContext(c.req.param('id'));
    return c.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load job';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

pipelineJobs.patch('/:id', async (c) => {
  const body = await c.req.json<{
    stage?: PipelineJobStage;
    external_job_id?: string | null;
    error_message?: string | null;
  }>();

  const job = await getPipelineJobById(c.req.param('id'));
  if (!job) return c.json({ error: 'Pipeline job not found' }, 404);

  const updated = await updatePipelineJob(job.id, {
    stage: body.stage,
    externalJobId: body.external_job_id,
    errorMessage: body.error_message,
  });

  if (body.stage) {
    await markDocumentForJobStage(job.documentId, body.stage);
  }

  return c.json({ ok: true, job: updated });
});

pipelineJobs.post('/:id/events', async (c) => {
  const body = await c.req.json<{ event?: string; provider?: string; external_job_id?: string }>();
  const job = await getPipelineJobById(c.req.param('id'));
  if (!job) return c.json({ error: 'Pipeline job not found' }, 404);

  if (body.event !== 'provider_ready') {
    return c.json({ error: 'Unsupported event' }, 400);
  }
  if (job.stage !== 'submitted') {
    return c.json({ ok: true, skipped: true, reason: 'job not in submitted stage' });
  }

  if (body.external_job_id?.trim()) {
    await updatePipelineJob(job.id, { externalJobId: body.external_job_id.trim() });
  }

  await spawnAsyncPipelineWorker(job.id, job.pipelineName);
  return c.json({ ok: true, status: 'finalize_spawned' }, 202);
});

export default pipelineJobs;
