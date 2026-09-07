import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { buildChannelTreeForUser } from '../../auth/resource-access.ts';
import { denyUnlessChannelAccess } from '../../auth/require-resource-access.ts';
import { routeParam } from '../../infrastructure/http/route-param.ts';
import {
  handleGetResourceAccess,
  handlePutResourceAccess,
  handleTransferResourceOwner,
} from '../platform/resource-access-handlers.ts';
import {
  createChannel,
  deleteChannel,
  getChannelById,
  listChannelTree,
  updateChannel,
} from '../../document/application/documents.ts';
import { listHotwordsForDocumentChannel } from '../../audio/application/asr-hotwords.ts';

const channels = new Hono();

channels.use('*', requireAuth);

channels.get(
  '/processing-options',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    try {
    const { listPipelineConfigs } = await import('../pipeline/infrastructure/pipeline-config-store.ts');
    const { isDocumentAsyncPipelineName } = await import('../pipeline/application/pipeline-jobs.ts');
    const { isAudioAsyncPipelineName } = await import('../audio/domain/audio-pipeline-names.ts');
    const { isCapturePostProcessPipelineName } = await import(
      '../document/domain/capture/capture-post-process-pipeline-names.ts'
    );

    const { pipelines } = await listPipelineConfigs({ enabledOnly: true, limit: 100 });
    const documentPipelines = pipelines.filter((pipeline) =>
      isDocumentAsyncPipelineName(pipeline.pipelineName),
    );
    const transcriptionPipelines = pipelines.filter((pipeline) =>
      isAudioAsyncPipelineName(pipeline.pipelineName),
    );
    const postProcessPipelines = pipelines.filter((pipeline) =>
      isCapturePostProcessPipelineName(pipeline.pipelineName),
    );

    return c.json({
      document_pipelines: documentPipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        pipelineName: pipeline.pipelineName,
      })),
      transcription_pipelines: transcriptionPipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        pipelineName: pipeline.pipelineName,
      })),
      post_process_pipelines: postProcessPipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        pipelineName: pipeline.pipelineName,
      })),
    });
    } catch (error) {
      console.error('Failed to load document channel processing options', error);
      return c.json(
        { error: error instanceof Error ? error.message : 'Failed to load processing options' },
        500,
      );
    }
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
  '/:id/hotwords',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Channel id is required' }, 400);

    const denied = await denyUnlessChannelAccess(c, id, 'read');
    if (denied) return denied;

    const row = await getChannelById(id);
    if (!row) return c.json({ error: 'Channel not found' }, 404);

    const hotwords = await listHotwordsForDocumentChannel(id);
    return c.json({
      hotwords,
      asr_vocabulary_id: row.asrVocabularyId,
      asr_vocabulary_target_model: row.asrVocabularyTargetModel,
      asr_vocabulary_synced_at: row.asrVocabularySyncedAt?.toISOString() ?? null,
    });
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
      transcription_pipeline_id: row.transcriptionPipelineId,
      post_process_pipeline_id: row.postProcessPipelineId,
      auto_start_pipeline: row.autoStartPipeline,
      asr_vocabulary_id: row.asrVocabularyId,
      asr_vocabulary_target_model: row.asrVocabularyTargetModel,
      asr_vocabulary_synced_at: row.asrVocabularySyncedAt?.toISOString() ?? null,
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
      transcription_pipeline_id?: string | null;
      post_process_pipeline_id?: string | null;
      auto_start_pipeline?: boolean;
    }>();

    try {
      const pipelineId =
        body.pipeline_id === undefined ? undefined : body.pipeline_id?.trim() || null;
      const transcriptionPipelineId =
        body.transcription_pipeline_id === undefined
          ? undefined
          : body.transcription_pipeline_id?.trim() || null;
      const postProcessPipelineId =
        body.post_process_pipeline_id === undefined
          ? undefined
          : body.post_process_pipeline_id?.trim() || null;

      const autoStartPipeline =
        body.auto_start_pipeline === undefined ? undefined : Boolean(body.auto_start_pipeline);

      const channel = await updateChannel(id, {
        name: body.name,
        description: body.description,
        parentId: body.parent_id,
        pipelineId,
        transcriptionPipelineId,
        postProcessPipelineId,
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
