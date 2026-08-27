import { Hono } from 'hono';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { isServerlessRuntime } from '../services/pipeline/pipeline-worker-mode.ts';
import { StorageNotConfiguredError } from '../storage/s3-client.ts';
import { isStorageEnabled } from '../storage/s3-config.ts';
import { initSkillUpload } from '../services/skills/skill-upload.ts';
import { defaultSkillPreviewPath } from '../agent-assets/skill-browse.ts';
import {
  createPendingSkillFromUpload,
  deleteSkillForUser,
  getSkillDetailForUser,
  importSkillZipBufferForUser,
  listSkillTreeForUser,
  listVisibleSkillsForUser,
  readSkillFileForUser,
} from '../services/skills/skills.ts';
import {
  handleGetResourceAccess,
  handlePutResourceAccess,
} from './resource-access-handlers.ts';

const skills = new Hono();

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
}

skills.get('/', requireAuth, requireResourcePermission('agent', 'asset-market', 'read'), async (c) => {
  const user = getUser(c);
  const items = await listVisibleSkillsForUser(user.id);
  return c.json({
    skills: items.map((skill) => ({
      id: skill.id,
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      type: 'skill' as const,
      origin: skill.origin,
      source: skill.origin,
      import_status: skill.importStatus,
      import_error: skill.importError,
      can_manage: skill.canManage,
    })),
  });
});

skills.get('/:id', requireAuth, requireResourcePermission('agent', 'asset-market', 'read'), async (c) => {
  const user = getUser(c);
  const detail = await getSkillDetailForUser(user.id, c.req.param('id'));
  if (!detail) return c.json({ error: 'Skill not found' }, 404);
  return c.json({ skill: detail });
});

skills.get(
  '/:id/tree',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const user = getUser(c);
    try {
      const tree = await listSkillTreeForUser(user.id, c.req.param('id'));
      return c.json(tree);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Skill not found';
      return c.json({ error: message }, message === 'Skill not found' ? 404 : 400);
    }
  },
);

skills.get(
  '/:id/file',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const user = getUser(c);
    const path = c.req.query('path')?.trim() || defaultSkillPreviewPath();
    try {
      const file = await readSkillFileForUser(user.id, c.req.param('id'), path);
      return c.json(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file';
      const status = message === 'Not found' || message === 'Skill not found' ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

skills.post(
  '/upload-init',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);
    const body = await c.req.json<{
      filename?: string;
      file_hash?: string;
      size_bytes?: number;
    }>();
    try {
      const result = await initSkillUpload({
        filename: body.filename ?? '',
        fileHash: body.file_hash ?? '',
        sizeBytes: Number(body.size_bytes),
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: error instanceof Error ? error.message : 'Upload init failed' }, 400);
    }
  },
);

skills.post(
  '/upload-complete',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);
    const user = getUser(c);
    const body = await c.req.json<{
      filename?: string;
      file_hash?: string;
      s3_key?: string;
      size_bytes?: number;
    }>();
    try {
      const row = await createPendingSkillFromUpload({
        userId: user.id,
        filename: body.filename ?? '',
        fileHash: body.file_hash ?? '',
        s3Key: body.s3_key ?? '',
        sizeBytes: Number(body.size_bytes),
      });
      return c.json(
        {
          id: row.id,
          slug: row.slug,
          import_status: row.importStatus,
        },
        201,
      );
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Upload complete failed' }, 400);
    }
  },
);

skills.post(
  '/upload',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    if (isServerlessRuntime()) {
      return c.json({ error: 'Use upload-init and direct storage upload in production' }, 400);
    }
    const user = getUser(c);
    const body = await c.req.parseBody();
    const file = body.file instanceof File ? body.file : null;
    if (!file) return c.json({ error: 'file is required' }, 400);
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const row = await importSkillZipBufferForUser({ userId: user.id, buffer });
      return c.json({ id: row.id, slug: row.slug, import_status: row.importStatus }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Upload failed' }, 400);
    }
  },
);

skills.delete(
  '/:id',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    const user = getUser(c);
    try {
      await deleteSkillForUser(user.id, c.req.param('id'));
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      const status = message === 'Forbidden' ? 403 : message === 'Skill not found' ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

skills.get(
  '/:id/access',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const detail = await getSkillDetailForUser(getUser(c).id, c.req.param('id'));
    if (!detail || detail.origin !== 'user') {
      return c.json({ error: 'Skill not found' }, 404);
    }
    return handleGetResourceAccess(c, 'skill', detail.id);
  },
);

skills.put(
  '/:id/access',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    const detail = await getSkillDetailForUser(getUser(c).id, c.req.param('id'));
    if (!detail || detail.origin !== 'user') {
      return c.json({ error: 'Skill not found' }, 404);
    }
    return handlePutResourceAccess(c, 'skill', detail.id);
  },
);

export default skills;
