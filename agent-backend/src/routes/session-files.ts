import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { ownsConversation } from '../auth/permissions.ts';
import { conversationIdFromInstanceId } from '../shared/model/agent-instance-id.ts';
import {
  completeSessionFileBlobUpload,
  initSessionFileUpload,
} from '../services/session/session-file-upload.ts';
import {
  deleteSessionFile,
  listSessionFileItems,
  uploadSessionFile,
} from '../storage/session-files/session-file-service.ts';
import { isAllowedSessionFile } from '../storage/session-files/constants.ts';

const sessionFiles = new Hono();

async function requireConversationAccess(c: Context, next: Next) {
  const user = getUser(c);
  const instanceId = c.req.param('instanceId') ?? '';
  const conversationId = conversationIdFromInstanceId(instanceId);
  if (!(await ownsConversation(user.id, conversationId))) {
    return c.notFound();
  }
  await next();
}

sessionFiles.get(
  '/:agentName/:instanceId/session-files',
  requireAuth,
  requireConversationAccess,
  async (c) => {
    const instanceId = c.req.param('instanceId');
    const files = await listSessionFileItems(instanceId);
    return c.json({ files });
  },
);

sessionFiles.post(
  '/:agentName/:instanceId/session-files/upload-init',
  requireAuth,
  requireConversationAccess,
  async (c) => {
    const agentName = c.req.param('agentName');
    const instanceId = c.req.param('instanceId');
    const body = await c.req.json<{ filename?: string; size_bytes?: number }>();

    try {
      const result = await initSessionFileUpload({
        instanceId,
        agentName,
        filename: body.filename ?? '',
        sizeBytes: Number(body.size_bytes),
      });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload init failed';
      return c.json({ error: message }, 400);
    }
  },
);

sessionFiles.post(
  '/:agentName/:instanceId/session-files/upload-complete',
  requireAuth,
  requireConversationAccess,
  async (c) => {
    const agentName = c.req.param('agentName');
    const instanceId = c.req.param('instanceId');
    const body = await c.req.json<{
      file_id?: string;
      filename?: string;
      pathname?: string;
      size_bytes?: number;
    }>();

    try {
      const record = await completeSessionFileBlobUpload({
        instanceId,
        agentName,
        fileId: body.file_id ?? '',
        filename: body.filename ?? '',
        pathname: body.pathname ?? '',
        sizeBytes: Number(body.size_bytes),
      });
      return c.json({
        fileId: record.id,
        filename: record.filename,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        hasContentCache: Boolean(record.contentCacheKey),
        createdAt: record.createdAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload complete failed';
      return c.json({ error: message }, 400);
    }
  },
);

sessionFiles.post(
  '/:agentName/:instanceId/session-files',
  requireAuth,
  requireConversationAccess,
  async (c) => {
    const agentName = c.req.param('agentName');
    const instanceId = c.req.param('instanceId');
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Missing file field in multipart body.' }, 400);
    }
    if (!isAllowedSessionFile(file.name)) {
      return c.json({ error: 'Unsupported file type.' }, 400);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const record = await uploadSessionFile({
        instanceId,
        agentName,
        filename: file.name,
        bytes,
      });
      return c.json({
        fileId: record.id,
        filename: record.filename,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        hasContentCache: Boolean(record.contentCacheKey),
        createdAt: record.createdAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      return c.json({ error: message }, 400);
    }
  },
);

sessionFiles.delete(
  '/:agentName/:instanceId/session-files/:fileId',
  requireAuth,
  requireConversationAccess,
  async (c) => {
    const instanceId = c.req.param('instanceId');
    const fileId = c.req.param('fileId');
    const deleted = await deleteSessionFile(instanceId, fileId);
    if (!deleted) return c.notFound();
    return c.json({ ok: true });
  },
);

export default sessionFiles;
