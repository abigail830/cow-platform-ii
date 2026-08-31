import { Hono } from 'hono';
import { isStorageEnabled } from '../../storage/s3-config.ts';
import {
  getStorageInfo,
  planMoveStorageOperations,
  resolveStorageFolderPrefix,
  StorageNotConfiguredError,
  StorageValidationError,
  type MoveItem,
} from '../../storage/object-storage.ts';
import {
  presignCreateStorageFolder,
  presignListStorageObjects,
  presignMoveStorageOperations,
} from '../../storage/object-storage-presign.ts';
import { formatStorageError } from '../../storage/document-files.ts';
import { PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';

const storage = new Hono();

storage.use('*', requireAuth);

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
}

function handleStorageError(
  c: { json: (body: unknown, status?: number) => Response },
  error: unknown,
) {
  if (error instanceof StorageNotConfiguredError) {
    return storageUnavailable(c);
  }
  if (error instanceof StorageValidationError) {
    return c.json({ error: error.message }, 400);
  }
  const message = formatStorageError(error);
  if (message.toLowerCase().includes('not configured')) {
    return storageUnavailable(c);
  }
  return c.json({ error: message }, 503);
}

storage.get('/', requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.STORAGE, 'read'), async (c) => {
  if (!isStorageEnabled()) {
    return c.json({
      bucket: process.env.AWS_BUCKET_NAME?.trim() ?? '',
      storage_enabled: false,
    });
  }

  try {
    return c.json(getStorageInfo());
  } catch (error) {
    return handleStorageError(c, error);
  }
});

/** Presigned ListObjectsV2 URL — browser lists OSS directly (no Vercel→OSS TCP). */
storage.get(
  '/objects',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.STORAGE, 'read'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const prefix = c.req.query('prefix') ?? '';
    const continuationToken = c.req.query('continuation_token') ?? undefined;
    const maxKeys = Number(c.req.query('max_keys') ?? 100);
    const recursive = c.req.query('recursive') === 'true' || c.req.query('recursive') === '1';

    try {
      const manifest = await presignListStorageObjects({
        prefix,
        continuationToken,
        maxKeys: Number.isFinite(maxKeys) ? maxKeys : 100,
        recursive,
      });
      return c.json({
        mode: 'browser_direct',
        bucket: manifest.bucket,
        prefix: manifest.prefix,
        list_url: manifest.list_url,
      });
    } catch (error) {
      return handleStorageError(c, error);
    }
  },
);

/** Presigned PUT for folder placeholder — browser uploads empty body to OSS. */
storage.post(
  '/folders',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.STORAGE, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{ parent_prefix?: string; name?: string }>();
    if (!body.name?.trim()) {
      return c.json({ error: 'name is required' }, 400);
    }

    try {
      const folderPrefix = resolveStorageFolderPrefix({
        parentPrefix: body.parent_prefix,
        name: body.name,
      });
      const presigned = await presignCreateStorageFolder(folderPrefix);
      return c.json({
        mode: 'browser_direct',
        prefix: presigned.prefix,
        upload_url: presigned.upload_url,
      });
    } catch (error) {
      return handleStorageError(c, error);
    }
  },
);

/** Presigned copy/delete steps — browser executes move against OSS directly. */
storage.post(
  '/move',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.STORAGE, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{
      items?: Array<{ type?: string; key?: string }>;
      destination_prefix?: string;
      delete_source?: boolean;
      folder_object_keys?: Record<string, string[]>;
    }>();

    const items = body.items ?? [];
    if (items.length === 0 || items.length > 200) {
      return c.json({ error: 'items must contain 1–200 entries' }, 400);
    }
    if (body.destination_prefix === undefined) {
      return c.json({ error: 'destination_prefix is required' }, 400);
    }

    const normalizedItems: MoveItem[] = [];
    for (const item of items) {
      if (item.type !== 'prefix' && item.type !== 'object') {
        return c.json({ error: 'items[].type must be prefix or object' }, 400);
      }
      if (!item.key?.trim()) {
        return c.json({ error: 'items[].key is required' }, 400);
      }
      normalizedItems.push({ type: item.type, key: item.key.trim() });
    }

    try {
      const plan = planMoveStorageOperations({
        items: normalizedItems,
        destinationPrefix: body.destination_prefix,
        folderObjectKeys: body.folder_object_keys,
        deleteSource: body.delete_source,
      });
      const operations = await presignMoveStorageOperations(plan.operations);
      return c.json({
        mode: 'browser_direct',
        operations,
        skipped_count: plan.skipped_count,
        errors: plan.errors,
      });
    } catch (error) {
      return handleStorageError(c, error);
    }
  },
);

export default storage;
