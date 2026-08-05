import { Hono } from 'hono';
import { PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import { readCliPackagedDefaultConfigYaml } from '../../shared/cli-workflow-defaults.ts';
import { normalizePipelineConfigYaml } from '../../shared/pipeline-config-yaml.ts';
import {
  createPipelineConfig,
  deletePipelineConfig,
  getPipelineConfigById,
  listPipelineConfigs,
  updatePipelineConfig,
} from '../../shared/pipeline-config-store.ts';

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
    return c.json({ ...result, page, limit });
  },
);

/** Must be registered before /:id — packaged CLI default YAML. */
pipelines.get(
  '/default-config-yaml',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.PIPELINES, 'read'),
  async (c) => {
    const pipelineName = c.req.query('pipeline_name')?.trim();
    if (!pipelineName) {
      return c.json({ error: 'pipeline_name is required' }, 400);
    }
    try {
      const configYaml = readCliPackagedDefaultConfigYaml(pipelineName);
      if (configYaml === null) {
        return c.json({ error: `No packaged default for pipeline_name=${pipelineName}` }, 404);
      }
      return c.json({ pipeline_name: pipelineName, config_yaml: configYaml });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load default config YAML';
      return c.json({ error: message }, 500);
    }
  },
);

pipelines.post(
  '/validate-config-yaml',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.PIPELINES, 'read'),
  async (c) => {
    const body = await c.req.json<{ configYaml?: string | null }>();
    try {
      const normalized = normalizePipelineConfigYaml(body.configYaml);
      return c.json({ ok: true, config_yaml: normalized });
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : 'Invalid config YAML' },
        400,
      );
    }
  },
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

pipelines.get(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.PIPELINES, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id || !UUID_RE.test(id)) return c.json({ error: 'Not found' }, 404);

    try {
      const pipeline = await getPipelineConfigById(id);
      if (!pipeline) return c.json({ error: 'Not found' }, 404);
      return c.json({ pipeline });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load pipeline';
      return c.json({ error: message }, 500);
    }
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
      workflowFile?: string | null;
      configYaml?: string | null;
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
        workflowFile: body.workflowFile,
        configYaml: body.configYaml,
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
      workflowFile?: string | null;
      configYaml?: string | null;
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
