import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../../auth/rbac-catalog.ts';
import { getUser, requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { denyUnlessChannelAccess, denyUnlessKnowledgeBaseAccess } from '../../auth/require-resource-access.ts';
import { routeParam } from '../../infrastructure/http/route-param.ts';
import { isStorageEnabled } from '../../infrastructure/oss/s3-config.ts';
import {
  cancelIngestWorkflow,
  confirmIngestWorkflowUploads,
  createIngestWorkflow,
  getIngestWorkflowPublic,
  retryIngestWorkflowItem,
} from '../../kb/application/ingest-workflow.ts';

const workflows = new Hono();

workflows.use('*', requireAuth);

function storageUnavailable() {
  return { error: 'Object storage is not configured' };
}

type CreateWorkflowBody = {
  channel_id?: string;
  knowledge_base_id?: string;
  knowledge_base_type?: string;
  files?: Array<{
    client_ref: string;
    filename: string;
    file_hash: string;
    size_bytes: number;
    content_type?: string;
    type?: string;
  }>;
  steps?: Array<'upload' | 'process' | 'index'>;
  index_content?: { audio?: string };
  webhook_url?: string;
  webhook_secret?: string;
  signature_mode?: 'hmac_sha256' | 'none';
  index_mode?: 'batch' | 'per_item';
  retry?: { max_attempts?: number; auto_retry?: boolean };
  upload_deadline_hours?: number;
};

type UploadCompleteBody = {
  items?: Array<{
    client_ref?: string;
    item_id?: string;
    s3_key: string;
    file_hash: string;
    size_bytes: number;
  }>;
};

workflows.post(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    if (!isStorageEnabled()) return c.json(storageUnavailable(), 503);
    const user = getUser(c);
    const body = await c.req.json<CreateWorkflowBody>().catch((): CreateWorkflowBody => ({}));

    const channelId = body.channel_id?.trim() ?? '';
    const knowledgeBaseId = body.knowledge_base_id?.trim() ?? '';
    if (!channelId || !knowledgeBaseId) {
      return c.json({ error: 'channel_id and knowledge_base_id are required' }, 400);
    }
    const deniedChannel = await denyUnlessChannelAccess(c, channelId, 'write');
    if (deniedChannel) return deniedChannel;
    const deniedKb = await denyUnlessKnowledgeBaseAccess(c, knowledgeBaseId, 'write');
    if (deniedKb) return deniedKb;

    try {
      const result = await createIngestWorkflow({
        channelId,
        knowledgeBaseId,
        knowledgeBaseType: body.knowledge_base_type,
        files: body.files ?? [],
        steps: body.steps,
        indexContentAudio: body.index_content?.audio,
        webhookUrl: body.webhook_url,
        webhookSecret: body.webhook_secret,
        signatureMode: body.signature_mode,
        indexMode: body.index_mode,
        retry: body.retry,
        uploadDeadlineHours: body.upload_deadline_hours,
        idempotencyKey: c.req.header('Idempotency-Key'),
        createdBy: user.id,
      });
      return c.json(result, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create workflow';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

workflows.get(
  '/:workflowId',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'read',
  ),
  async (c) => {
    const workflowId = routeParam(c, 'workflowId');
    if (!workflowId) return c.json({ error: 'workflow id is required' }, 400);
    const result = await getIngestWorkflowPublic(workflowId);
    if (!result) return c.json({ error: 'Workflow not found' }, 404);
    const deniedChannel = await denyUnlessChannelAccess(c, result.channel_id, 'read');
    if (deniedChannel) return deniedChannel;
    const deniedKb = await denyUnlessKnowledgeBaseAccess(c, result.knowledge_base_id, 'read');
    if (deniedKb) return deniedKb;
    return c.json(result);
  },
);

workflows.post(
  '/:workflowId/upload-complete',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    if (!isStorageEnabled()) return c.json(storageUnavailable(), 503);
    const workflowId = routeParam(c, 'workflowId');
    if (!workflowId) return c.json({ error: 'workflow id is required' }, 400);
    const user = getUser(c);
    const existing = await getIngestWorkflowPublic(workflowId);
    if (!existing) return c.json({ error: 'Workflow not found' }, 404);
    const deniedChannel = await denyUnlessChannelAccess(c, existing.channel_id, 'write');
    if (deniedChannel) return deniedChannel;
    const deniedKb = await denyUnlessKnowledgeBaseAccess(c, existing.knowledge_base_id, 'write');
    if (deniedKb) return deniedKb;

    const body = await c.req.json<UploadCompleteBody>().catch((): UploadCompleteBody => ({}));

    try {
      const result = await confirmIngestWorkflowUploads({
        workflowId,
        createdBy: user.id,
        files: body.items ?? [],
      });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload complete failed';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

workflows.post(
  '/:workflowId/cancel',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const workflowId = routeParam(c, 'workflowId');
    if (!workflowId) return c.json({ error: 'workflow id is required' }, 400);
    const existing = await getIngestWorkflowPublic(workflowId);
    if (!existing) return c.json({ error: 'Workflow not found' }, 404);
    const deniedChannel = await denyUnlessChannelAccess(c, existing.channel_id, 'write');
    if (deniedChannel) return deniedChannel;
    const deniedKb = await denyUnlessKnowledgeBaseAccess(c, existing.knowledge_base_id, 'write');
    if (deniedKb) return deniedKb;
    try {
      const result = await cancelIngestWorkflow(workflowId);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cancel failed';
      return c.json({ error: message }, 400);
    }
  },
);

workflows.post(
  '/:workflowId/items/:itemId/retry',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  requireResourcePermission(
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    'write',
  ),
  async (c) => {
    const workflowId = routeParam(c, 'workflowId');
    const itemId = routeParam(c, 'itemId');
    if (!workflowId || !itemId) return c.json({ error: 'workflow and item id are required' }, 400);
    const existing = await getIngestWorkflowPublic(workflowId);
    if (!existing) return c.json({ error: 'Workflow not found' }, 404);
    const deniedChannel = await denyUnlessChannelAccess(c, existing.channel_id, 'write');
    if (deniedChannel) return deniedChannel;
    const deniedKb = await denyUnlessKnowledgeBaseAccess(c, existing.knowledge_base_id, 'write');
    if (deniedKb) return deniedKb;
    try {
      const result = await retryIngestWorkflowItem(workflowId, itemId);
      return c.json(result, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Retry failed';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default workflows;
