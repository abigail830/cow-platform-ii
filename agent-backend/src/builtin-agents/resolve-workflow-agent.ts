import { and, eq } from 'drizzle-orm';
import {
  appBuiltinAgentDefs,
  appDocumentChannels,
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
  workflowKey: 'faq_extract' | 'faq_polish',
): Promise<ResolvedBuiltinAgent> {
  const [kb] = await db
    .select({ faqSettings: appKnowledgeBases.faqSettings })
    .from(appKnowledgeBases)
    .where(eq(appKnowledgeBases.id, kbId))
    .limit(1);
  if (!kb) throw new Error('Knowledge base not found');

  const settings = (kb.faqSettings ?? {}) as KbFaqSettings;
  const agentDefId =
    workflowKey === 'faq_extract' ? settings.extraction_agent_def_id : settings.polish_agent_def_id;

  return resolveWorkflowAgent({
    workflowKey,
    override: { agentDefId: agentDefId ?? null },
  });
}

export async function resolveChannelMetadataAgent(channelId: string): Promise<ResolvedBuiltinAgent> {
  const [channel] = await db
    .select({ agentDefId: appDocumentChannels.metadataExtractionAgentDefId })
    .from(appDocumentChannels)
    .where(eq(appDocumentChannels.id, channelId))
    .limit(1);
  if (!channel) throw new Error('Channel not found');

  return resolveWorkflowAgent({
    workflowKey: 'metadata_extract',
    override: { agentDefId: channel.agentDefId },
  });
}

/** Expand agent def into legacy faq_settings fields for CLI compatibility. */
export function toLegacyFaqExtractionFields(agent: ResolvedBuiltinAgent): {
  extraction_model_config_id: string;
  extraction_prompt: string;
  extraction_system_prompt: string;
} {
  return {
    extraction_model_config_id: agent.modelConfigId,
    extraction_prompt: agent.userPromptTemplate,
    extraction_system_prompt: agent.systemPrompt,
  };
}
