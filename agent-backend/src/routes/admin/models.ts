import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { appModelConfigs, db, MODEL_API_TYPES, type ModelApiType } from '../../db/index.ts';
import { PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import { invalidateCatalogAgentRuntimeCache } from '../../agent-catalog/resolve-agent-runtime.ts';
import { invalidateModelConfigCache } from '../../shared/model/model-registry.ts';
import {
  decryptModelConfigApiKey,
  hasStoredModelConfigApiKey,
  sealModelConfigApiKeyForStorage,
} from '../../shared/model/model-config-secret.ts';

const models = new Hono();

models.use('*', requireAuth);

type ModelRow = typeof appModelConfigs.$inferSelect;

function toPublicModel(row: ModelRow) {
  return {
    id: row.id,
    name: row.name,
    modelId: row.modelId,
    provider: row.provider,
    apiType: row.apiType,
    capabilities: row.capabilities ?? [],
    baseUrl: row.baseUrl,
    hasApiKey: hasStoredModelConfigApiKey(row.apiKey),
    isDefault: row.isDefault,
    extraConfig: row.extraConfig ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Full model row for admin copy — includes API key (write permission required). */
function toAdminDetailModel(row: ModelRow) {
  return {
    ...toPublicModel(row),
    apiKey: decryptModelConfigApiKey(row.apiKey),
  };
}

function parseApiType(value: unknown): ModelApiType | null {
  if (typeof value !== 'string') return null;
  return MODEL_API_TYPES.includes(value as ModelApiType) ? (value as ModelApiType) : null;
}

function parseCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

async function findModelConfigByName(name: string, excludeId?: string) {
  const conditions = [eq(appModelConfigs.name, name)];
  if (excludeId) conditions.push(ne(appModelConfigs.id, excludeId));
  const [row] = await db
    .select({ id: appModelConfigs.id })
    .from(appModelConfigs)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

models.get('/', requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.MODELS, 'read'), async (c) => {
  const apiType = c.req.query('apiType');
  const search = c.req.query('search')?.trim();
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 25), 1), 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (apiType && apiType !== 'all') {
    const parsed = parseApiType(apiType);
    if (!parsed) return c.json({ error: 'Invalid apiType' }, 400);
    conditions.push(eq(appModelConfigs.apiType, parsed));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(appModelConfigs.name, pattern),
        ilike(appModelConfigs.modelId, pattern),
        ilike(appModelConfigs.provider, pattern),
      )!,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(appModelConfigs)
      .where(where)
      .orderBy(desc(appModelConfigs.isDefault), asc(appModelConfigs.name))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(appModelConfigs)
      .where(where),
  ]);

  return c.json({
    models: rows.map(toPublicModel),
    total: countRow[0]?.count ?? 0,
    page,
    limit,
  });
});

models.get(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.MODELS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Not found' }, 404);
    const [row] = await db.select().from(appModelConfigs).where(eq(appModelConfigs.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ model: toAdminDetailModel(row) });
  },
);

models.post('/', requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.MODELS, 'write'), async (c) => {
  const body = await c.req.json<{
    name?: string;
    modelId?: string;
    provider?: string;
    apiType?: string;
    capabilities?: unknown;
    baseUrl?: string | null;
    apiKey?: string | null;
    isDefault?: boolean;
    extraConfig?: Record<string, unknown>;
  }>();

  const name = body.name?.trim();
  const modelId = body.modelId?.trim();
  const provider = body.provider?.trim();
  const apiType = parseApiType(body.apiType);
  if (!name || !modelId || !provider || !apiType) {
    return c.json({ error: 'name, modelId, provider, and apiType are required' }, 400);
  }

  const capabilities = parseCapabilities(body.capabilities);
  const baseUrl = body.baseUrl?.trim() || null;
  const apiKey = sealModelConfigApiKeyForStorage(body.apiKey);
  const extraConfig = body.extraConfig ?? {};

  if (await findModelConfigByName(name)) {
    return c.json({ error: `Model config name "${name}" already exists` }, 409);
  }

  const [row] = await db
    .insert(appModelConfigs)
    .values({
      name,
      modelId,
      provider,
      apiType,
      capabilities,
      baseUrl,
      apiKey,
      isDefault: Boolean(body.isDefault),
      extraConfig,
    })
    .returning();

  if (body.isDefault) {
    await db
      .update(appModelConfigs)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(appModelConfigs.apiType, apiType), sql`${appModelConfigs.id} <> ${row.id}`));
  }

  invalidateModelConfigCache();
  invalidateCatalogAgentRuntimeCache();
  return c.json({ model: toPublicModel(row) }, 201);
});

models.patch('/:id', requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.MODELS, 'write'), async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<{
    name?: string;
    modelId?: string;
    provider?: string;
    apiType?: string;
    capabilities?: unknown;
    baseUrl?: string | null;
    apiKey?: string | null;
    isDefault?: boolean;
    extraConfig?: Record<string, unknown>;
  }>();

  const [existing] = await db.select().from(appModelConfigs).where(eq(appModelConfigs.id, id)).limit(1);
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const updates: Partial<typeof appModelConfigs.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return c.json({ error: 'name cannot be empty' }, 400);
    if (await findModelConfigByName(name, id)) {
      return c.json({ error: `Model config name "${name}" already exists` }, 409);
    }
    updates.name = name;
  }
  if (body.modelId !== undefined) {
    const modelId = body.modelId.trim();
    if (!modelId) return c.json({ error: 'modelId cannot be empty' }, 400);
    updates.modelId = modelId;
  }
  if (body.provider !== undefined) {
    const provider = body.provider.trim();
    if (!provider) return c.json({ error: 'provider cannot be empty' }, 400);
    updates.provider = provider;
  }
  if (body.apiType !== undefined) {
    const apiType = parseApiType(body.apiType);
    if (!apiType) return c.json({ error: 'Invalid apiType' }, 400);
    updates.apiType = apiType;
  }
  if (body.capabilities !== undefined) updates.capabilities = parseCapabilities(body.capabilities);
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl?.trim() || null;
  if (body.apiKey !== undefined) {
    updates.apiKey = sealModelConfigApiKeyForStorage(body.apiKey);
  }
  if (body.extraConfig !== undefined) updates.extraConfig = body.extraConfig;
  if (body.isDefault !== undefined) updates.isDefault = Boolean(body.isDefault);

  const [row] = await db
    .update(appModelConfigs)
    .set(updates)
    .where(eq(appModelConfigs.id, id))
    .returning();

  if (!row) return c.json({ error: 'Not found' }, 404);

  if (body.isDefault) {
    await db
      .update(appModelConfigs)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(appModelConfigs.apiType, row.apiType), sql`${appModelConfigs.id} <> ${row.id}`));
  }

  invalidateModelConfigCache();
  invalidateCatalogAgentRuntimeCache();
  return c.json({ model: toPublicModel(row) });
});

models.post('/:id/set-default', requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.MODELS, 'write'), async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Not found' }, 404);
  const [existing] = await db.select().from(appModelConfigs).where(eq(appModelConfigs.id, id)).limit(1);
  if (!existing) return c.json({ error: 'Not found' }, 404);

  await db
    .update(appModelConfigs)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(appModelConfigs.apiType, existing.apiType));

  const [row] = await db
    .update(appModelConfigs)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(appModelConfigs.id, id))
    .returning();

  invalidateModelConfigCache();
  invalidateCatalogAgentRuntimeCache();
  return c.json({ model: toPublicModel(row!) });
});

models.delete('/:id', requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.MODELS, 'write'), async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Not found' }, 404);
  const [row] = await db
    .delete(appModelConfigs)
    .where(eq(appModelConfigs.id, id))
    .returning({ id: appModelConfigs.id });

  if (!row) return c.json({ error: 'Not found' }, 404);
  invalidateModelConfigCache();
  invalidateCatalogAgentRuntimeCache();
  return c.json({ ok: true });
});

export default models;
