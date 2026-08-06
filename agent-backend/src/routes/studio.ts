import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { listAssetSummaries, listPlatformAgentDirs, loadPlatformMcpTemplate } from '../agent-assets/manifest.ts';
import { parseMcpServersJson } from '../agent-assets/parse-mcp-servers.ts';
import {
  defaultSkillPreviewPath,
  listSkillTree,
  readSkillFile,
} from '../agent-assets/skill-browse.ts';
import { bootAgentCatalog, upsertStudioAgentInRegistry } from '../agent-catalog/boot.ts';
import { loadAgentSpec } from '../agent-catalog/discover.ts';
import { listPlatformMcpDiscoveredTools } from '../agent-catalog/load-mcp.ts';
import { getAgentRegistry } from '../agent-catalog/registry.ts';
import { invalidateCatalogAgentRuntimeCache, resolveCatalogAgentRuntime } from '../agent-catalog/resolve-agent-runtime.ts';
import { getUser, requireAuth } from '../auth/jwt.ts';
import {
  getResourceAccessSettings,
  replaceResourceAccessSettings,
  userHasStudioAgentAccess,
  type ResourceAccessPutInput,
} from '../auth/resource-access.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import {
  appModelConfigs,
  appStudioAgents,
  appUserMcpCredentials,
  appUserMcpServers,
  db,
} from '../db/index.ts';
import { reloadFlueRuntimeFromRegistry } from '../flue-vercel-init.ts';
import {
  hasStoredModelConfigApiKey,
  sealModelConfigApiKeyForStorage,
} from '../shared/model-config-secret.ts';
import {
  assertDatasourceIdsOwnedByUser,
  createDatasourceForUser,
  deleteDatasourceForUser,
  listDatasourcesForUser,
} from '../database-mcp/datasource-service.ts';

const studio = new Hono();

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/);

const datasourceBodySchema = z.object({
  name: slugSchema,
  displayTitle: z.string().max(120).optional(),
  type: z.enum(['postgres', 'mysql']),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(128),
  password: z.string().min(1),
  database: z.string().min(1).max(128),
  ssl: z.boolean().optional(),
  readonly: z.boolean().optional(),
  maxRows: z.number().int().min(1).max(1000).optional(),
  statementTimeoutMs: z.number().int().min(1000).max(120_000).optional(),
});

const agentBodySchema = z.object({
  slug: slugSchema,
  displayName: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  icon: z.string().max(64).optional(),
  instructions: z.string().default(''),
  modelConfigId: z.string().uuid(),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  skillIds: z.array(z.string()).default([]),
  platformMcpIds: z.array(z.string()).default([]),
  privateMcpIds: z.array(z.string().uuid()).default([]),
  datasourceIds: z.array(z.string().uuid()).default([]),
  sandbox: z.record(z.string(), z.unknown()).default({ provider: 'none' }),
  a2a: z.record(z.string(), z.unknown()).nullable().optional(),
});

async function syncAgentRuntime(slug: string): Promise<void> {
  await upsertStudioAgentInRegistry(slug);
  invalidateCatalogAgentRuntimeCache();
  await reloadFlueRuntimeFromRegistry();
}

studio.get(
  '/assets',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const raw = (c.req.query('type') ?? 'all').toLowerCase();
    const type =
      raw === 'skills' ? 'skill' : raw === 'agents' ? 'agent' : raw === 'sandboxes' ? 'sandbox' : raw;
    if (type === 'skill' || type === 'mcp' || type === 'sandbox') {
      return c.json({ assets: listAssetSummaries(type) });
    }
    if (type === 'agent' || type === 'all') {
      const platformAgents = listPlatformAgentDirs().map((dir) => {
        const spec = loadAgentSpec(dir);
        return {
          id: spec.id,
          title: spec.displayName,
          description: spec.description,
          type: 'agent' as const,
          source: 'platform' as const,
          icon: spec.icon,
        };
      });
      if (type === 'agent') return c.json({ assets: platformAgents });
      return c.json({
        assets: [
          ...platformAgents,
          ...listAssetSummaries('skill'),
          ...listAssetSummaries('mcp'),
          ...listAssetSummaries('sandbox'),
        ],
      });
    }
    return c.json({ error: 'type must be agent|skill|mcp|sandbox|all' }, 400);
  },
);

studio.get(
  '/assets/mcp/:id',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    try {
      const template = loadPlatformMcpTemplate(c.req.param('id'));
      const user = getUser(c);
      const discovered = await listPlatformMcpDiscoveredTools(template.id, user.id);
      return c.json({
        mcp: {
          id: template.id,
          title: template.title,
          description: template.description,
          /** Industry-shaped connection config (Cursor/Claude `.mcp.json` subset). */
          config: { mcpServers: template.mcpServers },
          tools: discovered,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Unknown MCP' }, 404);
    }
  },
);

studio.get(
  '/assets/agents/:id/copy-draft',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const id = c.req.param('id');
    const dir = listPlatformAgentDirs().find((path) => path.split(/[/\\]/).pop() === id);
    if (!dir) return c.json({ error: 'Unknown platform agent' }, 404);
    try {
      const spec = loadAgentSpec(dir);
      const configName = spec.model.configName?.trim();
      let modelConfigId: string | null = null;
      if (configName) {
        const [model] = await db
          .select({ id: appModelConfigs.id })
          .from(appModelConfigs)
          .where(eq(appModelConfigs.name, configName))
          .limit(1);
        modelConfigId = model?.id ?? null;
      }
      const skillIds = spec.skills.map((skillPath) => {
        const parts = skillPath.replace(/\\/g, '/').split('/').filter(Boolean);
        return parts[parts.length - 1]!;
      });
      return c.json({
        draft: {
          slug: `${spec.id}-copy`,
          displayName: `Copy of ${spec.displayName}`,
          description: spec.description,
          instructions: spec.instructions,
          modelConfigId,
          skillIds,
          platformMcpIds: spec.mcp.map((server) => server.name),
          sandbox: spec.sandbox ?? { provider: 'none' },
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Failed to load agent' }, 500);
    }
  },
);

studio.get(
  '/assets/skills/:id/tree',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    try {
      const { skillId, tree } = listSkillTree(c.req.param('id'));
      return c.json({ skillId, tree, defaultPath: defaultSkillPreviewPath(tree) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Unknown skill' }, 404);
    }
  },
);

studio.get(
  '/assets/skills/:id/file',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const path = c.req.query('path')?.trim();
    if (!path) return c.json({ error: 'path is required' }, 400);
    try {
      const file = readSkillFile(c.req.param('id'), path);
      return c.json(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file';
      const status = message === 'Not found' || message.startsWith('Unknown') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

studio.get(
  '/agents',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const user = getUser(c);
    const rows = await db.select().from(appStudioAgents).orderBy(desc(appStudioAgents.updatedAt));
    const visible = [];
    for (const row of rows) {
      if (await userHasStudioAgentAccess(user.id, row.id, 'read')) {
        visible.push({
          id: row.id,
          slug: row.slug,
          displayName: row.displayName,
          description: row.description,
          icon: row.icon,
          origin: row.origin,
          createdBy: row.createdBy,
          updatedAt: row.updatedAt,
          source: 'studio' as const,
        });
      }
    }
    return c.json({ agents: visible });
  },
);

studio.post(
  '/agents',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    const user = getUser(c);
    const body = agentBodySchema.parse(await c.req.json());
    const [model] = await db
      .select({ id: appModelConfigs.id })
      .from(appModelConfigs)
      .where(eq(appModelConfigs.id, body.modelConfigId))
      .limit(1);
    if (!model) return c.json({ error: 'modelConfigId not found' }, 400);

    try {
      await assertDatasourceIdsOwnedByUser(user.id, body.datasourceIds);
      const [row] = await db
        .insert(appStudioAgents)
        .values({
          slug: body.slug,
          displayName: body.displayName,
          description: body.description,
          icon: body.icon,
          origin: 'user',
          createdBy: user.id,
          instructions: body.instructions,
          modelConfigId: body.modelConfigId,
          thinkingLevel: body.thinkingLevel,
          skillIds: body.skillIds,
          platformMcpIds: body.platformMcpIds,
          privateMcpIds: body.privateMcpIds,
          datasourceIds: body.datasourceIds,
          sandbox: body.sandbox,
          a2a: body.a2a ?? null,
        })
        .returning();
      await syncAgentRuntime(row!.slug);
      return c.json({ agent: row }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique|duplicate/i.test(message)) {
        return c.json({ error: `slug "${body.slug}" already exists` }, 409);
      }
      if (/datasource|not allowed|password/i.test(message)) {
        return c.json({ error: message }, 400);
      }
      throw error;
    }
  },
);

studio.get(
  '/agents/:id',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const user = getUser(c);
    const id = c.req.param('id');
    const [row] = await db.select().from(appStudioAgents).where(eq(appStudioAgents.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (!(await userHasStudioAgentAccess(user.id, row.id, 'read'))) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    return c.json({ agent: row });
  },
);

studio.patch(
  '/agents/:id',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    const user = getUser(c);
    const id = c.req.param('id');
    const [existing] = await db.select().from(appStudioAgents).where(eq(appStudioAgents.id, id)).limit(1);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!(await userHasStudioAgentAccess(user.id, existing.id, 'write'))) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    const body = agentBodySchema.partial().parse(await c.req.json());
    if (body.slug && body.slug !== existing.slug) {
      return c.json({ error: 'slug cannot be changed' }, 400);
    }
    if (body.datasourceIds) {
      try {
        await assertDatasourceIdsOwnedByUser(user.id, body.datasourceIds);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 400);
      }
    }
    const [row] = await db
      .update(appStudioAgents)
      .set({
        ...body,
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(eq(appStudioAgents.id, id))
      .returning();
    await syncAgentRuntime(row!.slug);
    return c.json({ agent: row });
  },
);

studio.delete(
  '/agents/:id',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    const user = getUser(c);
    const id = c.req.param('id');
    const [existing] = await db.select().from(appStudioAgents).where(eq(appStudioAgents.id, id)).limit(1);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!(await userHasStudioAgentAccess(user.id, existing.id, 'manage'))) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    const slug = existing.slug;
    await db.delete(appStudioAgents).where(eq(appStudioAgents.id, id));
    await syncAgentRuntime(slug);
    return c.json({ ok: true });
  },
);

studio.get('/agents/:id/access', requireAuth, async (c) => {
  const user = getUser(c);
  const settings = await getResourceAccessSettings('studio_agent', c.req.param('id'), user.id);
  if (!settings) return c.json({ error: 'Not found' }, 404);
  if (!settings.my_access.read) return c.json({ error: 'Forbidden' }, 403);
  return c.json(settings);
});

studio.put('/agents/:id/access', requireAuth, async (c) => {
  const user = getUser(c);
  const body = (await c.req.json()) as ResourceAccessPutInput;
  try {
    const settings = await replaceResourceAccessSettings('studio_agent', c.req.param('id'), user.id, body);
    return c.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Forbidden') return c.json({ error: 'Forbidden' }, 403);
    throw error;
  }
});

studio.get('/datasources', requireAuth, async (c) => {
  const user = getUser(c);
  const datasources = await listDatasourcesForUser(user.id);
  return c.json({ datasources });
});

studio.post('/datasources', requireAuth, async (c) => {
  const user = getUser(c);
  const body = datasourceBodySchema.parse(await c.req.json());
  try {
    const row = await createDatasourceForUser(user.id, body);
    invalidateCatalogAgentRuntimeCache();
    return c.json(
      {
        datasource: {
          id: row.id,
          name: row.name,
          displayTitle: row.displayTitle,
          type: row.type,
          host: row.host,
          port: row.port,
          username: row.username,
          database: row.database,
          ssl: row.ssl,
          readonly: row.readonly,
          maxRows: row.maxRows,
          statementTimeoutMs: row.statementTimeoutMs,
          updatedAt: row.updatedAt,
        },
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 400);
  }
});

studio.delete('/datasources/:id', requireAuth, async (c) => {
  const user = getUser(c);
  const ok = await deleteDatasourceForUser(user.id, c.req.param('id'));
  if (!ok) return c.json({ error: 'Not found' }, 404);
  invalidateCatalogAgentRuntimeCache();
  return c.json({ ok: true });
});

studio.get('/my-mcp-servers', requireAuth, async (c) => {
  const user = getUser(c);
  const rows = await db
    .select()
    .from(appUserMcpServers)
    .where(eq(appUserMcpServers.createdBy, user.id))
    .orderBy(desc(appUserMcpServers.updatedAt));
  return c.json({
    servers: rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      config: row.config,
      hasSecrets: hasStoredModelConfigApiKey(row.secrets),
      updatedAt: row.updatedAt,
    })),
  });
});

studio.post('/my-mcp-servers', requireAuth, async (c) => {
  const user = getUser(c);
  const body = z
    .object({
      name: slugSchema,
      title: z.string().optional(),
      config: z.record(z.string(), z.unknown()),
      secretHeaderValue: z.string().optional(),
    })
    .parse(await c.req.json());
  const parsed = parseMcpServersJson({ mcpServers: { [body.name]: body.config } });
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const [row] = await db
    .insert(appUserMcpServers)
    .values({
      createdBy: user.id,
      name: body.name,
      title: body.title,
      config: body.config,
      secrets: sealModelConfigApiKeyForStorage(body.secretHeaderValue),
    })
    .returning();
  return c.json({ server: row }, 201);
});

studio.delete('/my-mcp-servers/:id', requireAuth, async (c) => {
  const user = getUser(c);
  await db
    .delete(appUserMcpServers)
    .where(and(eq(appUserMcpServers.id, c.req.param('id')), eq(appUserMcpServers.createdBy, user.id)));
  return c.json({ ok: true });
});

studio.get(
  '/mcp-credentials',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'read'),
  async (c) => {
    const user = getUser(c);
    const rows = await db
      .select()
      .from(appUserMcpCredentials)
      .where(eq(appUserMcpCredentials.userId, user.id));
    return c.json({
      credentials: rows.map((row) => ({
        platformMcpId: row.platformMcpId,
        hasSecrets: hasStoredModelConfigApiKey(row.secrets),
      })),
    });
  },
);

studio.put(
  '/mcp-credentials/:platformMcpId',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    const user = getUser(c);
    const platformMcpId = c.req.param('platformMcpId');
    try {
      loadPlatformMcpTemplate(platformMcpId);
    } catch {
      return c.json({ error: 'Unknown platform MCP' }, 404);
    }
    const body = z.object({ apiKey: z.string().min(1) }).parse(await c.req.json());
    const sealed = sealModelConfigApiKeyForStorage(body.apiKey);
    if (!sealed) return c.json({ error: 'apiKey required' }, 400);
    const [row] = await db
      .insert(appUserMcpCredentials)
      .values({ userId: user.id, platformMcpId, secrets: sealed })
      .onConflictDoUpdate({
        target: [appUserMcpCredentials.userId, appUserMcpCredentials.platformMcpId],
        set: { secrets: sealed, updatedAt: new Date() },
      })
      .returning();
    return c.json({ platformMcpId: row!.platformMcpId, hasSecrets: true });
  },
);

studio.post(
  '/mcp/validate',
  requireAuth,
  requireResourcePermission('agent', 'asset-market', 'write'),
  async (c) => {
    const body = await c.req.json();
    const parsed = parseMcpServersJson(body);
    if (!parsed.ok) return c.json({ ok: false, error: parsed.error }, 400);
    return c.json({
      ok: true,
      servers: parsed.servers.map((s) => ({ name: s.name, url: s.url, transport: s.transport })),
    });
  },
);

studio.post(
  '/agents/:name/warm',
  requireAuth,
  requireResourcePermission('agent', 'playground', 'read'),
  async (c) => {
    const name = c.req.param('name');
    bootAgentCatalog();
    const entry = getAgentRegistry().get(name);
    if (!entry) return c.json({ error: 'Unknown agent' }, 404);
    void resolveCatalogAgentRuntime(entry.spec).catch((error) => {
      console.warn(`[warm] agent "${name}" failed:`, error);
    });
    return c.json({ ok: true, warming: true });
  },
);

export default studio;
