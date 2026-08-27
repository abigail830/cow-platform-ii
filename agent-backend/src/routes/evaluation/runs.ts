import { Hono } from 'hono';
import { EVALUATION_CATEGORY, EVALUATION_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  createEvalRun,
  deleteEvalRun,
  assertEvalRunFilesMutable,
  getEvalRunCompareUrls,
  getEvalRunDetail,
  getEvalRunDatasetId,
  listEvalRunProcessingOptions,
  listEvalRuns,
  startEvalRun,
} from '../../services/eval/eval-runs.ts';
import {
  deleteEvalDatasetItem,
  finalizeEvalDatasetItemUpload,
  initEvalDatasetItemUpload,
  listEvalDatasetItems,
} from '../../services/eval/eval-datasets.ts';
import { formatEvalDatasetDbError } from '../../services/eval/eval-dataset-db-error.ts';
import { isStorageEnabled } from '../../storage/s3-config.ts';
import { StorageNotConfiguredError } from '../../storage/s3-client.ts';

const runs = new Hono();

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
}

function routeError(error: unknown, fallback: string): { message: string; status: 400 | 404 } {
  const message = formatEvalDatasetDbError(error);
  const status: 400 | 404 = message.includes('not found') ? 404 : 400;
  return { message: message || fallback, status };
}

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

    if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
    if (!Array.isArray(body.pipeline_config_ids) || body.pipeline_config_ids.length === 0) {
      return c.json({ error: 'pipeline_config_ids is required' }, 400);
    }

    try {
      const created = await createEvalRun({
        datasetId: body.dataset_id?.trim() || undefined,
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

runs.post(
  '/:id/judge/:datasetItemId/retry',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    const datasetItemId = routeParam(c, 'datasetItemId');
    if (!id) return c.json({ error: 'Run id is required' }, 400);
    if (!datasetItemId) return c.json({ error: 'Dataset item id is required' }, 400);

    try {
      const attemptId = c.req.query('attempt_id')?.trim() || undefined;
      const { retryEvalRunJudgeJob } = await import('../../services/eval/eval-run-judge.ts');
      await retryEvalRunJudgeJob(id, datasetItemId, attemptId);
      const detail = await getEvalRunDetail(id);
      return c.json(detail, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry compare';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
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

runs.get(
  '/:id/files',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Run id is required' }, 400);

    try {
      const datasetId = await getEvalRunDatasetId(id);
      const items = await listEvalDatasetItems(datasetId);
      return c.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load files';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

runs.post(
  '/:id/files/upload-init',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Run id is required' }, 400);

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
      const datasetId = await assertEvalRunFilesMutable(id);
      const result = await initEvalDatasetItemUpload({
        datasetId,
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

runs.post(
  '/:id/files/upload-complete',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Run id is required' }, 400);

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
      const datasetId = await assertEvalRunFilesMutable(id);
      const item = await finalizeEvalDatasetItemUpload({
        datasetId,
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

runs.delete(
  '/:id/files/:itemId',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.RUNS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    const itemId = routeParam(c, 'itemId');
    if (!id || !itemId) return c.json({ error: 'Run id and item id are required' }, 400);

    try {
      const datasetId = await assertEvalRunFilesMutable(id);
      await deleteEvalDatasetItem(datasetId, itemId);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete file';
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
