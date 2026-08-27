import { Hono } from 'hono';
import { EVALUATION_CATEGORY, EVALUATION_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  createEvalDataset,
  deleteEvalDataset,
  deleteEvalDatasetItem,
  finalizeEvalDatasetItemUpload,
  getEvalDatasetById,
  getEvalDatasetItemDownloadUrl,
  initEvalDatasetItemUpload,
  listEvalDatasetItems,
  listEvalDatasets,
  updateEvalDataset,
} from '../../services/eval/eval-datasets.ts';
import { formatEvalDatasetDbError } from '../../services/eval/eval-dataset-db-error.ts';
import { isStorageEnabled } from '../../storage/s3-config.ts';
import { StorageNotConfiguredError } from '../../storage/s3-client.ts';

const datasets = new Hono();

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
}

datasets.use('*', requireAuth);

function routeError(error: unknown, fallback: string): { message: string; status: 400 | 404 } {
  const message = formatEvalDatasetDbError(error);
  const status: 400 | 404 = message.includes('not found') ? 404 : 400;
  return { message: message || fallback, status };
}

datasets.get(
  '/',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'read'),
  async (c) => {
    const rows = await listEvalDatasets();
    return c.json({ datasets: rows });
  },
);

datasets.post(
  '/',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'write'),
  async (c) => {
    const user = getUser(c);
    const body = await c.req.json<{ name?: string; description?: string | null }>();
    if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);

    try {
      const dataset = await createEvalDataset({
        name: body.name,
        description: body.description,
        createdBy: user.id,
      });
      return c.json(dataset, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to create dataset' }, 400);
    }
  },
);

datasets.get(
  '/:id',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Dataset id is required' }, 400);

    const row = await getEvalDatasetById(id);
    if (!row) return c.json({ error: 'Dataset not found' }, 404);

    return c.json({
      id: row.id,
      name: row.name,
      description: row.description,
      kind: row.kind,
      media_type: row.mediaType,
      item_count: row.itemCount,
      created_by: row.createdBy,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  },
);

datasets.put(
  '/:id',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Dataset id is required' }, 400);

    const body = await c.req.json<{ name?: string; description?: string | null }>();
    try {
      const dataset = await updateEvalDataset(id, body);
      return c.json(dataset);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update dataset';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

datasets.delete(
  '/:id',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Dataset id is required' }, 400);

    try {
      await deleteEvalDataset(id);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete dataset';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

datasets.get(
  '/:id/items',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Dataset id is required' }, 400);

    const row = await getEvalDatasetById(id);
    if (!row) return c.json({ error: 'Dataset not found' }, 404);

    const items = await listEvalDatasetItems(id);
    return c.json({ items });
  },
);

datasets.post(
  '/:id/items/upload-init',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Dataset id is required' }, 400);

    const body = await c.req.json<{
      filename?: string;
      file_hash?: string;
      size_bytes?: number;
      content_type?: string;
    }>();

    const filename = body.filename?.trim() ?? '';
    const sizeBytes = Number(body.size_bytes);
    if (!filename) return c.json({ error: 'filename is required' }, 400);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
      return c.json({ error: 'size_bytes is required' }, 400);
    }

    try {
      const result = await initEvalDatasetItemUpload({
        datasetId: id,
        filename,
        fileHash: body.file_hash ?? '',
        sizeBytes,
        contentType: body.content_type,
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      const { message, status } = routeError(error, 'Upload init failed');
      return c.json({ error: message }, status);
    }
  },
);

datasets.post(
  '/:id/items/upload-complete',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Dataset id is required' }, 400);

    const body = await c.req.json<{
      item_id?: string;
      filename?: string;
      file_hash?: string;
      s3_key?: string;
      size_bytes?: number;
    }>();

    const itemId = body.item_id?.trim() ?? '';
    const filename = body.filename?.trim() ?? '';
    const s3Key = body.s3_key?.trim() ?? '';
    const sizeBytes = Number(body.size_bytes);

    if (!itemId || !filename || !s3Key) {
      return c.json({ error: 'item_id, filename, and s3_key are required' }, 400);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
      return c.json({ error: 'size_bytes is required' }, 400);
    }

    try {
      const item = await finalizeEvalDatasetItemUpload({
        datasetId: id,
        itemId,
        filename,
        fileHash: body.file_hash ?? '',
        s3Key,
        sizeBytes,
        uploadedBy: user.id,
      });
      return c.json(item, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      const { message, status } = routeError(error, 'Upload complete failed');
      return c.json({ error: message }, status);
    }
  },
);

datasets.get(
  '/:id/items/:itemId/download-url',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'read'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const id = routeParam(c, 'id');
    const itemId = routeParam(c, 'itemId');
    if (!id || !itemId) return c.json({ error: 'Dataset id and item id are required' }, 400);

    try {
      const result = await getEvalDatasetItemDownloadUrl(id, itemId);
      return c.json(result);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      const message = error instanceof Error ? error.message : 'Failed to create download URL';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

datasets.delete(
  '/:id/items/:itemId',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.DATASETS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    const itemId = routeParam(c, 'itemId');
    if (!id || !itemId) return c.json({ error: 'Dataset id and item id are required' }, 400);

    try {
      await deleteEvalDatasetItem(id, itemId);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete item';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default datasets;
