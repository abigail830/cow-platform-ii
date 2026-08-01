import { Hono } from 'hono';
import { PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  createPipelineConfig,
  deletePipelineConfig,
  getPipelineConfigById,
  listPipelineConfigs,
  updatePipelineConfig,
} from '../../shared/pipeline-config-store.ts';
import { listSystemPipelineTemplates } from '../../shared/pipeline-catalog.ts';

const pipelines = new Hono();

pipelines.use('*', requireAuth);

pipelines.get(
  '/',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.PIPELINES, 'read'),
  async (c) => {
    const search = c.req.query('search')?.trim();
    const enabledOnly = c.req.query('enabled_only') === 'true';
    const page = Math.max(Number(c.req.query('page') ?? 1), 1);
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 25), 1), 100);
    const result = await listPipelineConfigs({ search, enabledOnly, page, limit });
    const systemPipelines = listSystemPipelineTemplates(search);
    return c.json({ ...result, system_pipelines: systemPipelines, page, limit });
  },
);

pipelines.get(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.PIPELINES, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Not found' }, 404);

    const pipeline = await getPipelineConfigById(id);
    if (!pipeline) return c.json({ error: 'Not found' }, 404);
    return c.json({ pipeline });
  },
);

pipelines.post(
  '/',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.PIPELINES, 'write'),
  async (c) => {
    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      pipelineName?: string;
      commandTemplate?: string;
      modelConfigId?: string | null;
      isEnabled?: boolean;
    }>();

    if (!body.name?.trim() || !body.pipelineName?.trim() || !body.commandTemplate?.trim()) {
      return c.json({ error: 'name, pipelineName, and commandTemplate are required' }, 400);
    }

    try {
      const pipeline = await createPipelineConfig({
        name: body.name,
        description: body.description,
        pipelineName: body.pipelineName,
        commandTemplate: body.commandTemplate,
        modelConfigId: body.modelConfigId,
        isEnabled: body.isEnabled,
      });
      return c.json({ pipeline }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to create pipeline' }, 400);
    }
  },
);

pipelines.patch(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.PIPELINES, 'write'),
  async (c) => {
    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      pipelineName?: string;
      commandTemplate?: string;
      modelConfigId?: string | null;
      isEnabled?: boolean;
    }>();

    try {
      const id = routeParam(c, 'id');
      if (!id) return c.json({ error: 'Not found' }, 404);

      const pipeline = await updatePipelineConfig(id, body);
      return c.json({ pipeline });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update pipeline';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

pipelines.delete(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.PIPELINES, 'write'),
  async (c) => {
    try {
      const id = routeParam(c, 'id');
      if (!id) return c.json({ error: 'Not found' }, 404);

      await deletePipelineConfig(id);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete pipeline';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default pipelines;
