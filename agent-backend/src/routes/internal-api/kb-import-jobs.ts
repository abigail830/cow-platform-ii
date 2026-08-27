import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  buildKbImportJobWorkerContext,
  getKbImportJobById,
  updateKbImportJob,
  type KbImportJobStatus,
} from '../../services/kb/knowledge-bases.ts';

const kbImportJobs = new Hono();

kbImportJobs.use('*', requireCliInternalAuth);

kbImportJobs.get('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Job id is required' }, 400);

  try {
    const ctx = await buildKbImportJobWorkerContext(id);
    return c.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load job';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

kbImportJobs.patch('/:id', async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Job id is required' }, 400);

  const body = await c.req.json<{
    status?: KbImportJobStatus;
    completed_count?: number;
    failed_count?: number;
    error_message?: string | null;
  }>().catch(() => ({}));

  const job = await getKbImportJobById(id);
  if (!job) return c.json({ error: 'Job not found' }, 404);

  const updated = await updateKbImportJob(id, {
    status: body.status,
    completedCount: body.completed_count,
    failedCount: body.failed_count,
    errorMessage: body.error_message,
  });

  return c.json({ ok: true, job: updated });
});

export default kbImportJobs;
