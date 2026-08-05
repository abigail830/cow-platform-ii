import { and, eq } from 'drizzle-orm';
import {
  appBuiltinAgentDefs,
  appKnowledgeBases,
  appWorkflowBindings,
  db,
  type BuiltinWorkflowKey,
  type KbFaqSettings,
} from '../db/index.ts';

export type ResolvedBuiltinAgent = {
  id: string;
  slug: string;
  name: string;
  workflowKey: BuiltinWorkflowKey;
  apiType: string;
  modelConfigId: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputMode: string;
  outputSchema: Record<string, unknown> | null;
  temperature: string | null;
  maxTokens: number | null;
  version: number;
};

export type BuiltinAgentOverride = {
  agentDefId?: string | null;
};

async function loadAgentDefById(id: string): Promise<ResolvedBuiltinAgent | null> {
  const [row] = await db.select().from(appBuiltinAgentDefs).where(eq(appBuiltinAgentDefs.id, id)).limit(1);
  if (!row) return null;
  return toResolvedAgent(row);
}

async function loadPlatformBinding(workflowKey: BuiltinWorkflowKey): Promise<ResolvedBuiltinAgent | null> {
  const [binding] = await db
    .select()
    .from(appWorkflowBindings)
    .where(and(eq(appWorkflowBindings.workflowKey, workflowKey), eq(appWorkflowBindings.enabled, true)))
    .limit(1);
  if (!binding) return null;
  return loadAgentDefById(binding.builtinAgentDefId);
}

function toResolvedAgent(row: typeof appBuiltinAgentDefs.$inferSelect): ResolvedBuiltinAgent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    workflowKey: row.workflowKey as BuiltinWorkflowKey,
    apiType: row.apiType,
    modelConfigId: row.modelConfigId,
    systemPrompt: row.systemPrompt,
    userPromptTemplate: row.userPromptTemplate,
    outputMode: row.outputMode,
    outputSchema: (row.outputSchema as Record<string, unknown> | null) ?? null,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    version: row.version,
  };
}

export async function resolveWorkflowAgent(input: {
  workflowKey: BuiltinWorkflowKey;
  override?: BuiltinAgentOverride;
}): Promise<ResolvedBuiltinAgent> {
  const overrideId = input.override?.agentDefId?.trim();
  if (overrideId) {
    const agent = await loadAgentDefById(overrideId);
    if (!agent) throw new Error(`Builtin agent not found: ${overrideId}`);
    if (agent.workflowKey !== input.workflowKey) {
      throw new Error(`Agent "${agent.name}" is not compatible with workflow ${input.workflowKey}`);
    }
    return agent;
  }

  const platform = await loadPlatformBinding(input.workflowKey);
  if (!platform) {
    throw new Error(`No platform default agent configured for workflow ${input.workflowKey}`);
  }
  return platform;
}

export async function resolveKbFaqWorkflowAgent(
  kbId: string,
  workflowKey: 'faq_polish',
): Promise<ResolvedBuiltinAgent> {
  const [kb] = await db
    .select({ faqSettings: appKnowledgeBases.faqSettings })
    .from(appKnowledgeBases)
    .where(eq(appKnowledgeBases.id, kbId))
    .limit(1);
  if (!kb) throw new Error('Knowledge base not found');

  const settings = (kb.faqSettings ?? {}) as KbFaqSettings;

  return resolveWorkflowAgent({
    workflowKey,
    override: { agentDefId: settings.polish_agent_def_id ?? null },
  });
}
