import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  buildAudioPipelineJobContext,
  getAudioPipelineJobById,
  markAudioForJobStage,
  resolveAudioPipelineJobErrorMessage,
  updateAudioPipelineJob,
  type AudioPipelineJobStage,
} from '../../services/audio-pipeline-jobs.ts';
import { spawnAsyncAudioPipelineWorker } from '../../services/audio-pipeline-runner.ts';

const audioPipelineJobs = new Hono();

audioPipelineJobs.use('*', requireCliInternalAuth);

audioPipelineJobs.get('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Audio pipeline job id is required' }, 400);

  try {
    const ctx = await buildAudioPipelineJobContext(id);
    return c.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load job';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

audioPipelineJobs.patch('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Audio pipeline job id is required' }, 400);

  const body = await c.req.json<{
    stage?: AudioPipelineJobStage;
    external_job_id?: string | null;
    error_message?: string | null;
  }>();

  const job = await getAudioPipelineJobById(id);
  if (!job) return c.json({ error: 'Audio pipeline job not found' }, 404);

  const updated = await updateAudioPipelineJob(job.id, {
    stage: body.stage,
    externalJobId: body.external_job_id,
    ...(body.error_message !== undefined
      ? {
          errorMessage: resolveAudioPipelineJobErrorMessage(job.errorMessage, body.error_message),
        }
      : {}),
  });

  if (body.stage) {
    await markAudioForJobStage(job.audioId, body.stage);
  }

  return c.json({ ok: true, job: updated });
});

audioPipelineJobs.post('/:id/events', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Audio pipeline job id is required' }, 400);

  const body = await c.req.json<{ event?: string; provider?: string; external_job_id?: string }>();
  const job = await getAudioPipelineJobById(id);
  if (!job) return c.json({ error: 'Audio pipeline job not found' }, 404);

  if (body.event !== 'provider_ready') {
    return c.json({ error: 'Unsupported event' }, 400);
  }
  if (job.stage !== 'submitted' && job.stage !== 'transcribing') {
    return c.json({ ok: true, skipped: true, reason: 'job not awaiting provider' });
  }

  if (body.external_job_id?.trim()) {
    await updateAudioPipelineJob(job.id, { externalJobId: body.external_job_id.trim() });
  }

  await spawnAsyncAudioPipelineWorker(job.id, job.pipelineName);
  return c.json({ ok: true, status: 'worker_spawned' }, 202);
});

export default audioPipelineJobs;
