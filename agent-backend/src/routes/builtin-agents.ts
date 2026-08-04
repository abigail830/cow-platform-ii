import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { appBuiltinAgentDefs, appModelConfigs, BUILTIN_WORKFLOW_KEYS, db, type BuiltinWorkflowKey } from '../db/index.ts';
import {
  hasResourcePermission,
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_RESOURCES,
  PLATFORM_BASIC_CATEGORY,
  PLATFORM_BASIC_RESOURCES,
} from '../auth/rbac-catalog.ts';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { loadUserAccessProfile } from '../auth/rbac.ts';

const builtinAgentOptions = new Hono();

builtinAgentOptions.use('*', requireAuth);

function parseWorkflowKey(value: unknown): BuiltinWorkflowKey | null {
  if (typeof value !== 'string') return null;
  return BUILTIN_WORKFLOW_KEYS.includes(value as BuiltinWorkflowKey)
    ? (value as BuiltinWorkflowKey)
    : null;
}

builtinAgentOptions.get('/options', async (c) => {
  const workflow = parseWorkflowKey(c.req.query('workflow'));
  if (!workflow) return c.json({ error: 'workflow is required' }, 400);

  const profile = await loadUserAccessProfile(getUser(c).id);
  const canList =
    hasResourcePermission(profile.permissionKeys, PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS, 'read') ||
    hasResourcePermission(
      profile.permissionKeys,
      KNOWLEDGE_MANAGEMENT_CATEGORY,
      KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
      'read',
    );
  if (!canList) return c.json({ error: 'Forbidden' }, 403);

  const rows = await db
    .select({
      id: appBuiltinAgentDefs.id,
      name: appBuiltinAgentDefs.name,
      slug: appBuiltinAgentDefs.slug,
      workflowKey: appBuiltinAgentDefs.workflowKey,
      modelName: appModelConfigs.name,
    })
    .from(appBuiltinAgentDefs)
    .leftJoin(appModelConfigs, eq(appBuiltinAgentDefs.modelConfigId, appModelConfigs.id))
    .where(eq(appBuiltinAgentDefs.workflowKey, workflow))
    .orderBy(asc(appBuiltinAgentDefs.name));

  return c.json({
    agents: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      workflow_key: row.workflowKey,
      model_name: row.modelName,
    })),
  });
});

export default builtinAgentOptions;
