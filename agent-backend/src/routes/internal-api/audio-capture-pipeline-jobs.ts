import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  buildCapturePipelineJobContext,
  getCapturePipelineJobById,
  markCaptureForJobStage,
  updateCapturePipelineJob,
  type CapturePipelineJobStage,
} from '../../services/audio/audio-capture-pipeline-jobs.ts';
import { spawnCapturePostProcessWorker } from '../../services/audio/audio-capture-pipeline-runner.ts';

const audioCapturePipelineJobs = new Hono();

audioCapturePipelineJobs.use('*', requireCliInternalAuth);

audioCapturePipelineJobs.get('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Capture pipeline job id is required' }, 400);

  try {
    const ctx = await buildCapturePipelineJobContext(id);
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

  const job = await getCapturePipelineJobById(id);
  if (!job) return c.json({ error: 'Capture pipeline job not found' }, 404);

  const updated = await updateCapturePipelineJob(job.id, {
    stage: body.stage,
    errorMessage: body.error_message,
  });

  if (body.stage) {
    await markCaptureForJobStage(job.captureId, body.stage);
  }

  return c.json({ ok: true, job: updated });
});

audioCapturePipelineJobs.post('/:id/events', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Capture pipeline job id is required' }, 400);

  const job = await getCapturePipelineJobById(id);
  if (!job) return c.json({ error: 'Capture pipeline job not found' }, 404);

  await spawnCapturePostProcessWorker(job.id, job.pipelineName);
  return c.json({ ok: true, status: 'worker_spawned' }, 202);
});

export default audioCapturePipelineJobs;
