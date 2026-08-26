import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  buildEvalPipelineJobContext,
  getEvalRunItemById,
  markEvalRunItemForJobStage,
  updateEvalRunItem,
} from '../../services/eval-pipeline-jobs.ts';
import { resolveAudioPipelineJobErrorMessage } from '../../services/audio-pipeline-jobs.ts';
import { spawnAsyncEvalPipelineWorker } from '../../services/eval-pipeline-runner.ts';
import type { EvalRunItemStage } from '../../db/index.ts';

const evalPipelineJobs = new Hono();

evalPipelineJobs.use('*', requireCliInternalAuth);

evalPipelineJobs.get('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Eval pipeline job id is required' }, 400);

  try {
    const ctx = await buildEvalPipelineJobContext(id);
    return c.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load job';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

evalPipelineJobs.patch('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Eval pipeline job id is required' }, 400);

  const body = await c.req.json<{
    stage?: EvalRunItemStage;
    external_job_id?: string | null;
    error_message?: string | null;
    metrics?: Record<string, unknown> | null;
  }>();

  const item = await getEvalRunItemById(id);
  if (!item) return c.json({ error: 'Eval pipeline job not found' }, 404);

  const updated = await updateEvalRunItem(item.id, {
    stage: body.stage,
    externalJobId: body.external_job_id,
    metrics: body.metrics,
    ...(body.error_message !== undefined
      ? {
          errorMessage: resolveAudioPipelineJobErrorMessage(item.errorMessage, body.error_message),
        }
      : {}),
  });

  if (body.stage) {
    await markEvalRunItemForJobStage(item.id, body.stage);
  }

  return c.json({ ok: true, job: updated });
});

evalPipelineJobs.post('/:id/events', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Eval pipeline job id is required' }, 400);

  const body = await c.req.json<{ event?: string; provider?: string; external_job_id?: string }>();
  const item = await getEvalRunItemById(id);
  if (!item) return c.json({ error: 'Eval pipeline job not found' }, 404);

  if (body.event !== 'provider_ready') {
    return c.json({ error: 'Unsupported event' }, 400);
  }
  if (item.stage !== 'submitted' && item.stage !== 'transcribing') {
    return c.json({ ok: true, skipped: true, reason: 'job not awaiting provider' });
  }

  if (body.external_job_id?.trim()) {
    await updateEvalRunItem(item.id, { externalJobId: body.external_job_id.trim() });
  }

  const ctx = await buildEvalPipelineJobContext(id);
  await spawnAsyncEvalPipelineWorker(id, ctx.pipeline_name, ctx.api_url);
  return c.json({ ok: true, status: 'worker_spawned' }, 202);
});

export default evalPipelineJobs;
