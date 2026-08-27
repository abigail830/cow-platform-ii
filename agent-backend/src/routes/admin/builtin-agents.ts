import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  appBuiltinAgentDefs,
  appModelConfigs,
  appWorkflowBindings,
  BUILTIN_WORKFLOW_KEYS,
  db,
  type BuiltinWorkflowKey,
} from '../../db/index.ts';
import { PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES } from '../../auth/rbac-catalog.ts';
import { getUser, requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import { WORKFLOW_VARIABLES } from '../../builtin-agents/defaults.ts';
import { getAllBuiltinAgentsUsageStats, getBuiltinAgentUsageStats, listBuiltinAgentRuns } from '../../builtin-agents/agent-stats.ts';
import { normalizeSyncAgentDraft } from '../../builtin-agents/normalize-sync-agent-draft.ts';
import { runSyncAgent, type SyncAgentDraftDef } from '../../builtin-agents/sync-agent-runner.ts';
import { resolveModelCliParams } from '../../services/models/model-cli-params.ts';

const builtinAgents = new Hono();

builtinAgents.use('*', requireAuth);

type AgentRow = typeof appBuiltinAgentDefs.$inferSelect;

function parseWorkflowKey(value: unknown): BuiltinWorkflowKey | null {
  if (typeof value !== 'string') return null;
  return BUILTIN_WORKFLOW_KEYS.includes(value as BuiltinWorkflowKey)
    ? (value as BuiltinWorkflowKey)
    : null;
}

function toPublicAgent(row: AgentRow, modelName?: string | null) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    workflow_key: row.workflowKey,
    api_type: row.apiType,
    model_config_id: row.modelConfigId,
    model_name: modelName ?? null,
    system_prompt: row.systemPrompt,
    user_prompt_template: row.userPromptTemplate,
    output_mode: row.outputMode,
    output_schema: row.outputSchema ?? null,
    temperature: row.temperature,
    max_tokens: row.maxTokens,
    is_system: row.isSystem,
    version: row.version,
    variables: WORKFLOW_VARIABLES[row.workflowKey as BuiltinWorkflowKey] ?? [],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function loadModelName(modelConfigId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: appModelConfigs.name })
    .from(appModelConfigs)
    .where(eq(appModelConfigs.id, modelConfigId))
    .limit(1);
  return row?.name ?? null;
}

builtinAgents.get(
  '/',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'read'),
  async (c) => {
    const workflow = parseWorkflowKey(c.req.query('workflow'));
    const search = c.req.query('search')?.trim();

    const conditions = [];
    if (workflow) conditions.push(eq(appBuiltinAgentDefs.workflowKey, workflow));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(ilike(appBuiltinAgentDefs.name, pattern), ilike(appBuiltinAgentDefs.slug, pattern))!,
      );
    }

    const rows = await db
      .select()
      .from(appBuiltinAgentDefs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(appBuiltinAgentDefs.isSystem), asc(appBuiltinAgentDefs.name));

    const agents = await Promise.all(
      rows.map(async (row) => toPublicAgent(row, await loadModelName(row.modelConfigId))),
    );

    return c.json({ agents });
  },
);

builtinAgents.get(
  '/bindings',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'read'),
  async (c) => {
    const rows = await db
      .select({
        workflowKey: appWorkflowBindings.workflowKey,
        builtinAgentDefId: appWorkflowBindings.builtinAgentDefId,
        enabled: appWorkflowBindings.enabled,
        agentName: appBuiltinAgentDefs.name,
        agentSlug: appBuiltinAgentDefs.slug,
      })
      .from(appWorkflowBindings)
      .innerJoin(appBuiltinAgentDefs, eq(appWorkflowBindings.builtinAgentDefId, appBuiltinAgentDefs.id))
      .orderBy(asc(appWorkflowBindings.workflowKey));

    return c.json({
      bindings: rows.map((row) => ({
        workflow_key: row.workflowKey,
        builtin_agent_def_id: row.builtinAgentDefId,
        enabled: row.enabled,
        agent_name: row.agentName,
        agent_slug: row.agentSlug,
      })),
    });
  },
);

builtinAgents.get(
  '/stats',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'read'),
  async (c) => {
    const stats = await getAllBuiltinAgentsUsageStats(c.req.query('days'));
    return c.json({ stats });
  },
);

builtinAgents.get(
  '/runs',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'read'),
  async (c) => {
    const agentId = c.req.query('agent_id')?.trim() || undefined;
    const runs = await listBuiltinAgentRuns({
      agentId,
      daysInput: c.req.query('days'),
    });
    return c.json({ runs });
  },
);

builtinAgents.get(
  '/:id/stats',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Agent id is required' }, 400);

    const stats = await getBuiltinAgentUsageStats(id, c.req.query('days'));
    if (!stats) return c.json({ error: 'Not found' }, 404);

    return c.json({ stats });
  },
);

builtinAgents.get(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Agent id is required' }, 400);

    const [row] = await db.select().from(appBuiltinAgentDefs).where(eq(appBuiltinAgentDefs.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    return c.json({ agent: await toPublicAgent(row, await loadModelName(row.modelConfigId)) });
  },
);

builtinAgents.post(
  '/',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'write'),
  async (c) => {
    const body = await c.req.json<{
      slug?: string;
      name?: string;
      description?: string | null;
      workflow_key?: string;
      api_type?: string;
      model_config_id?: string;
      system_prompt?: string;
      user_prompt_template?: string;
      output_mode?: string;
      output_schema?: Record<string, unknown> | null;
      temperature?: string | null;
      max_tokens?: number | null;
    }>();

    const workflowKey = parseWorkflowKey(body.workflow_key);
    if (!workflowKey) return c.json({ error: 'Invalid workflow_key' }, 400);
    if (!body.slug?.trim() || !body.name?.trim()) return c.json({ error: 'slug and name are required' }, 400);
    if (!body.model_config_id?.trim()) return c.json({ error: 'model_config_id is required' }, 400);

    const [existing] = await db
      .select({ id: appBuiltinAgentDefs.id })
      .from(appBuiltinAgentDefs)
      .where(eq(appBuiltinAgentDefs.slug, body.slug.trim()))
      .limit(1);
    if (existing) return c.json({ error: 'Slug already exists' }, 409);

    const [row] = await db
      .insert(appBuiltinAgentDefs)
      .values({
        slug: body.slug.trim(),
        name: body.name.trim(),
        description: body.description?.trim() || null,
        workflowKey,
        apiType: body.api_type?.trim() || (workflowKey === 'session_image_extract' ? 'vlm' : 'chat-completions'),
        modelConfigId: body.model_config_id.trim(),
        systemPrompt: body.system_prompt ?? '',
        userPromptTemplate: body.user_prompt_template ?? '',
        outputMode: body.output_mode?.trim() || (workflowKey === 'faq_extract' ? 'json' : 'text'),
        outputSchema: body.output_schema ?? null,
        temperature: body.temperature ?? null,
        maxTokens: body.max_tokens ?? null,
        isSystem: false,
        version: 1,
      })
      .returning();

    return c.json({ agent: await toPublicAgent(row, await loadModelName(row.modelConfigId)) }, 201);
  },
);

builtinAgents.patch(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Agent id is required' }, 400);

    const [current] = await db.select().from(appBuiltinAgentDefs).where(eq(appBuiltinAgentDefs.id, id)).limit(1);
    if (!current) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      model_config_id?: string;
      system_prompt?: string;
      user_prompt_template?: string;
      output_mode?: string;
      output_schema?: Record<string, unknown> | null;
      temperature?: string | null;
      max_tokens?: number | null;
    }>();

    const [row] = await db
      .update(appBuiltinAgentDefs)
      .set({
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
        ...(body.model_config_id !== undefined ? { modelConfigId: body.model_config_id.trim() } : {}),
        ...(body.system_prompt !== undefined ? { systemPrompt: body.system_prompt } : {}),
        ...(body.user_prompt_template !== undefined ? { userPromptTemplate: body.user_prompt_template } : {}),
        ...(body.output_mode !== undefined ? { outputMode: body.output_mode } : {}),
        ...(body.output_schema !== undefined ? { outputSchema: body.output_schema } : {}),
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        ...(body.max_tokens !== undefined ? { maxTokens: body.max_tokens } : {}),
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(appBuiltinAgentDefs.id, id))
      .returning();

    return c.json({ agent: await toPublicAgent(row, await loadModelName(row.modelConfigId)) });
  },
);

builtinAgents.delete(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Agent id is required' }, 400);

    const [current] = await db.select().from(appBuiltinAgentDefs).where(eq(appBuiltinAgentDefs.id, id)).limit(1);
    if (!current) return c.json({ error: 'Not found' }, 404);
    if (current.isSystem) return c.json({ error: 'System agents cannot be deleted' }, 400);

    const [binding] = await db
      .select({ workflowKey: appWorkflowBindings.workflowKey })
      .from(appWorkflowBindings)
      .where(eq(appWorkflowBindings.builtinAgentDefId, id))
      .limit(1);
    if (binding) {
      return c.json({ error: 'Agent is used as a platform workflow default' }, 400);
    }

    await db.delete(appBuiltinAgentDefs).where(eq(appBuiltinAgentDefs.id, id));
    return c.json({ ok: true });
  },
);

builtinAgents.put(
  '/bindings/:workflowKey',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'write'),
  async (c) => {
    const workflowKey = parseWorkflowKey(routeParam(c, 'workflowKey'));
    if (!workflowKey) return c.json({ error: 'Invalid workflow key' }, 400);

    const body = await c.req.json<{ builtin_agent_def_id?: string; enabled?: boolean }>();
    if (!body.builtin_agent_def_id?.trim()) {
      return c.json({ error: 'builtin_agent_def_id is required' }, 400);
    }

    const [agent] = await db
      .select()
      .from(appBuiltinAgentDefs)
      .where(eq(appBuiltinAgentDefs.id, body.builtin_agent_def_id.trim()))
      .limit(1);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    if (agent.workflowKey !== workflowKey) {
      return c.json({ error: 'Agent workflow does not match binding' }, 400);
    }

    const [row] = await db
      .insert(appWorkflowBindings)
      .values({
        workflowKey,
        builtinAgentDefId: agent.id,
        enabled: body.enabled ?? true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appWorkflowBindings.workflowKey,
        set: {
          builtinAgentDefId: agent.id,
          enabled: body.enabled ?? true,
          updatedAt: new Date(),
        },
      })
      .returning();

    return c.json({
      binding: {
        workflow_key: row.workflowKey,
        builtin_agent_def_id: row.builtinAgentDefId,
        enabled: row.enabled,
      },
    });
  },
);

builtinAgents.post(
  '/:id/test-run',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Agent id is required' }, 400);

    const [agent] = await db.select().from(appBuiltinAgentDefs).where(eq(appBuiltinAgentDefs.id, id)).limit(1);
    if (!agent) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<{
      variables?: Record<string, string>;
      image_base64?: string;
      image_mime_type?: string;
      draft?: SyncAgentDraftDef | Record<string, unknown>;
    }>();

    const user = getUser(c);
    const variables = body.variables ?? {};
    const draft = normalizeSyncAgentDraft(body.draft);

    try {
      const result = await runSyncAgent({
        workflowKey: agent.workflowKey as BuiltinWorkflowKey,
        variables,
        override: { agentDefId: agent.id },
        draft,
        context: {
          triggerType: 'test',
          triggeredBy: user.id,
          inputSummary: Object.keys(variables).join(', '),
        },
        image:
          body.image_base64 && body.image_mime_type
            ? { base64: body.image_base64, mimeType: body.image_mime_type }
            : undefined,
      });

      const modelParams = draft?.modelConfigId
        ? await resolveModelCliParams({
            modelId: draft.modelConfigId,
            expectedApiType: 'chat-completions',
          })
        : await resolveModelCliParams({
            modelId: agent.modelConfigId,
            expectedApiType: 'chat-completions',
          });

      return c.json({
        run_id: result.runId,
        raw_text: result.rawText,
        parsed: result.parsed,
        latency_ms: result.latencyMs,
        model_config_id: modelParams.model_id,
        model_name: modelParams.config_name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test run failed';
      const runId = (error as { runId?: string }).runId;
      return c.json({ error: message, run_id: runId ?? null }, 502);
    }
  },
);

export default builtinAgents;
