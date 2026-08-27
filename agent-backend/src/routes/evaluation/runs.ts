import { Hono } from 'hono';
import { EVALUATION_CATEGORY, EVALUATION_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  createEvalRun,
  deleteEvalRun,
  getEvalRunCompareUrls,
  getEvalRunDetail,
  listEvalRunProcessingOptions,
  listEvalRuns,
  startEvalRun,
} from '../../services/eval-runs.ts';

const runs = new Hono();

runs.use('*', requireAuth);

runs.get(
  '/options',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'read'),
  async (c) => {
    const options = await listEvalRunProcessingOptions();
    return c.json(options);
  },
);

runs.get(
  '/',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'read'),
  async (c) => {
    const rows = await listEvalRuns();
    return c.json({ runs: rows });
  },
);

runs.post(
  '/',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'write'),
  async (c) => {
    const user = getUser(c);
    const body = await c.req.json<{
      dataset_id?: string;
      name?: string;
      description?: string | null;
      pipeline_config_ids?: string[];
      run_mode?: 'pipeline_only' | 'full';
    }>();

    if (!body.dataset_id?.trim()) return c.json({ error: 'dataset_id is required' }, 400);
    if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
    if (!Array.isArray(body.pipeline_config_ids) || body.pipeline_config_ids.length === 0) {
      return c.json({ error: 'pipeline_config_ids is required' }, 400);
    }

    try {
      const created = await createEvalRun({
        datasetId: body.dataset_id.trim(),
        name: body.name,
        description: body.description,
        pipelineConfigIds: body.pipeline_config_ids,
        runMode: body.run_mode,
        createdBy: user.id,
      });
      return c.json(created, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to create run' }, 400);
    }
  },
);

runs.get(
  '/:id',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Run id is required' }, 400);

    try {
      const detail = await getEvalRunDetail(id);
      return c.json(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load run';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

runs.post(
  '/:id/start',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Run id is required' }, 400);

    const body = await c.req.json<{ run_mode?: 'pipeline_only' | 'full' }>().catch(() => ({}));

    try {
      const detail = await startEvalRun(id, { runMode: body.run_mode });
      return c.json(detail, 202);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to start run' }, 400);
    }
  },
);

runs.get(
  '/:id/compare/:datasetItemId',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    const datasetItemId = routeParam(c, 'datasetItemId');
    if (!id) return c.json({ error: 'Run id is required' }, 400);
    if (!datasetItemId) return c.json({ error: 'Dataset item id is required' }, 400);

    try {
      const attemptId = c.req.query('attempt_id')?.trim() || undefined;
      const comparison = await getEvalRunCompareUrls(id, datasetItemId, attemptId);
      return c.json(comparison);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load comparison';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

runs.delete(
  '/:id',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Run id is required' }, 400);

    try {
      await deleteEvalRun(id);
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to delete run' }, 400);
    }
  },
);

export default runs;
