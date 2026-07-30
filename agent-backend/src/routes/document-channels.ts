import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { routeParam } from '../http/route-param.ts';
import {
  createChannel,
  deleteChannel,
  getChannelById,
  listChannelTree,
  updateChannel,
} from '../services/documents.ts';

const channels = new Hono();

channels.use('*', requireAuth);

channels.get(
  '/processing-options',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const { listPipelineConfigs } = await import('../shared/pipeline-config-store.ts');
    const { listRuntimeModelConfigs } = await import('../shared/model-config-store.ts');

    const [{ pipelines }, models] = await Promise.all([
      listPipelineConfigs({ enabledOnly: true, limit: 100 }),
      listRuntimeModelConfigs(),
    ]);

    const extractionModels = models
      .filter((model) => model.apiType === 'chat-completions')
      .map((model) => ({ id: model.id, name: model.name, isDefault: model.isDefault }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return c.json({
      pipelines: pipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        pipelineName: pipeline.pipelineName,
      })),
      extractionModels,
    });
  },
);

channels.get(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const tree = await listChannelTree();
    return c.json({ channels: tree });
  },
);

channels.get(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Channel id is required' }, 400);

    const row = await getChannelById(id);
    if (!row) return c.json({ error: 'Channel not found' }, 404);
    return c.json({
      id: row.id,
      name: row.name,
      description: row.description,
      parent_id: row.parentId,
      sort_order: row.sortOrder,
      metadata_extraction_model_id: row.metadataExtractionModelId,
      pipeline_id: row.pipelineId,
      auto_start_pipeline: row.autoStartPipeline,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  },
);

channels.post(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const user = getUser(c);
    const body = await c.req.json<{ name?: string; description?: string; parent_id?: string | null }>();
    if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);

    try {
      const channel = await createChannel({
        name: body.name,
        description: body.description,
        parentId: body.parent_id ?? null,
        createdBy: user.id,
      });
      return c.json(channel, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to create channel' }, 400);
    }
  },
);

channels.put(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      parent_id?: string | null;
      metadata_extraction_model_id?: string | null;
      pipeline_id?: string | null;
      auto_start_pipeline?: boolean;
    }>();

    try {
      const metadataExtractionModelId =
        body.metadata_extraction_model_id === undefined
          ? undefined
          : body.metadata_extraction_model_id?.trim() || null;

      const pipelineId =
        body.pipeline_id === undefined ? undefined : body.pipeline_id?.trim() || null;

      const autoStartPipeline =
        body.auto_start_pipeline === undefined ? undefined : Boolean(body.auto_start_pipeline);

      const id = routeParam(c, 'id');
      if (!id) return c.json({ error: 'Channel id is required' }, 400);

      const channel = await updateChannel(id, {
        name: body.name,
        description: body.description,
        parentId: body.parent_id,
        metadataExtractionModelId,
        pipelineId,
        autoStartPipeline,
      });
      return c.json(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update channel';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

channels.delete(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    try {
      const id = routeParam(c, 'id');
      if (!id) return c.json({ error: 'Channel id is required' }, 400);

      await deleteChannel(id);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete channel';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default channels;
