import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../http/route-param.ts';
import { buildEvalJudgeJobContext, getEvalJudgeJobById, updateEvalJudgeJob } from '../../services/eval/eval-judge-jobs.ts';
import { finalizeEvalJudgeJobFromWorker } from '../../services/eval/eval-run-judge.ts';
import type { EvalRunJudgeStatus } from '../../db/index.ts';

const evalJudgeJobs = new Hono();

evalJudgeJobs.use('*', requireCliInternalAuth);

evalJudgeJobs.get('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Eval judge job id is required' }, 400);

  try {
    const ctx = await buildEvalJudgeJobContext(id);
    return c.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load job';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

evalJudgeJobs.patch('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Eval judge job id is required' }, 400);

  const body = await c.req.json<{
    status?: EvalRunJudgeStatus;
    summary_metrics?: Record<string, unknown> | null;
    error_message?: string | null;
  }>();

  const job = await getEvalJudgeJobById(id);
  if (!job) return c.json({ error: 'Eval judge job not found' }, 404);

  if (body.status === 'running') {
    await updateEvalJudgeJob(id, { status: 'running', errorMessage: null });
    return c.json({ ok: true });
  }

  if (body.status === 'done' || body.status === 'failed') {
    await finalizeEvalJudgeJobFromWorker({
      jobId: id,
      status: body.status,
      summaryMetrics: body.summary_metrics ?? null,
      errorMessage: body.error_message ?? null,
    });
    return c.json({ ok: true });
  }

  await updateEvalJudgeJob(id, {
    status: body.status,
    errorMessage: body.error_message ?? null,
  });
  return c.json({ ok: true });
});

export default evalJudgeJobs;
