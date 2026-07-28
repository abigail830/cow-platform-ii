import { Hono } from 'hono';
import { isStorageEnabled } from '../../storage/s3-config.ts';
import {
  createStorageFolder,
  getStorageInfo,
  listStorageObjects,
  moveStorageItems,
  StorageNotConfiguredError,
  StorageValidationError,
} from '../../storage/object-storage.ts';
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
  const message = error instanceof Error ? error.message : 'Storage operation failed';
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

storage.get(
  '/objects',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.STORAGE, 'read'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const prefix = c.req.query('prefix') ?? '';
    const continuationToken = c.req.query('continuation_token') ?? undefined;
    const maxKeys = Number(c.req.query('max_keys') ?? 100);

    try {
      const result = await listStorageObjects({
        prefix,
        continuationToken,
        maxKeys: Number.isFinite(maxKeys) ? maxKeys : 100,
      });
      return c.json(result);
    } catch (error) {
      return handleStorageError(c, error);
    }
  },
);

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
      const result = await createStorageFolder({
        parentPrefix: body.parent_prefix,
        name: body.name,
      });
      return c.json(result);
    } catch (error) {
      return handleStorageError(c, error);
    }
  },
);

storage.post(
  '/move',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.STORAGE, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{
      items?: Array<{ type?: string; key?: string }>;
      destination_prefix?: string;
      delete_source?: boolean;
    }>();

    const items = body.items ?? [];
    if (items.length === 0 || items.length > 200) {
      return c.json({ error: 'items must contain 1–200 entries' }, 400);
    }
    if (body.destination_prefix === undefined) {
      return c.json({ error: 'destination_prefix is required' }, 400);
    }

    const normalizedItems = [];
    for (const item of items) {
      if (item.type !== 'prefix' && item.type !== 'object') {
        return c.json({ error: 'items[].type must be prefix or object' }, 400);
      }
      if (!item.key?.trim()) {
        return c.json({ error: 'items[].key is required' }, 400);
      }
      normalizedItems.push({ type: item.type, key: item.key });
    }

    try {
      const result = await moveStorageItems({
        items: normalizedItems,
        destinationPrefix: body.destination_prefix,
        deleteSource: body.delete_source,
      });
      return c.json(result);
    } catch (error) {
      return handleStorageError(c, error);
    }
  },
);

export default storage;
