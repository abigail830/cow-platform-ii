import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { buildChannelTreeForUser } from '../auth/resource-access.ts';
import { denyUnlessChannelAccess } from '../auth/require-resource-access.ts';
import { routeParam } from '../http/route-param.ts';
import {
  handleGetResourceAccess,
  handlePutResourceAccess,
  handleTransferResourceOwner,
} from './resource-access-handlers.ts';
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
    const { isDocumentAsyncPipelineName } = await import('../services/pipeline-jobs.ts');

    const { pipelines } = await listPipelineConfigs({ enabledOnly: true, limit: 100 });
    const documentPipelines = pipelines.filter((pipeline) =>
      isDocumentAsyncPipelineName(pipeline.pipelineName),
    );

    return c.json({
      pipelines: documentPipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        pipelineName: pipeline.pipelineName,
      })),
    });
  },
);

channels.get(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const user = getUser(c);
    const tree = await listChannelTree();
    const filtered = await buildChannelTreeForUser(user.id, tree);
    return c.json({ channels: filtered });
  },
);

channels.get(
  '/:id/access',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Channel id is required' }, 400);
    return handleGetResourceAccess(c, 'document_channel', id);
  },
);

channels.put(
  '/:id/access',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Channel id is required' }, 400);
    return handlePutResourceAccess(c, 'document_channel', id);
  },
);

channels.post(
  '/:id/access/transfer-owner',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Channel id is required' }, 400);
    return handleTransferResourceOwner(c, 'document_channel', id);
  },
);

channels.get(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Channel id is required' }, 400);

    const denied = await denyUnlessChannelAccess(c, id, 'read');
    if (denied) return denied;

    const row = await getChannelById(id);
    if (!row) return c.json({ error: 'Channel not found' }, 404);
    return c.json({
      id: row.id,
      name: row.name,
      description: row.description,
      parent_id: row.parentId,
      sort_order: row.sortOrder,
      pipeline_id: row.pipelineId,
      auto_start_pipeline: row.autoStartPipeline,
      created_by: row.createdBy,
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

    if (body.parent_id) {
      const denied = await denyUnlessChannelAccess(c, body.parent_id, 'manage');
      if (denied) return denied;
    }

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
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Channel id is required' }, 400);

    const denied = await denyUnlessChannelAccess(c, id, 'manage');
    if (denied) return denied;

    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      parent_id?: string | null;
      pipeline_id?: string | null;
      auto_start_pipeline?: boolean;
    }>();

    try {
      const pipelineId =
        body.pipeline_id === undefined ? undefined : body.pipeline_id?.trim() || null;

      const autoStartPipeline =
        body.auto_start_pipeline === undefined ? undefined : Boolean(body.auto_start_pipeline);

      const channel = await updateChannel(id, {
        name: body.name,
        description: body.description,
        parentId: body.parent_id,
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
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Channel id is required' }, 400);

    const denied = await denyUnlessChannelAccess(c, id, 'manage');
    if (denied) return denied;

    try {
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
