import { and, eq } from 'drizzle-orm';
import {
  appBuiltinAgentDefs,
  appKnowledgeBases,
  appModelConfigs,
  appWorkflowBindings,
  db,
  type BuiltinWorkflowKey,
} from '../db/index.ts';
import { BUILTIN_AGENT_SEEDS } from './defaults.ts';

type LegacyFaqSettings = {
  auto_index_on_publish?: boolean;
  extraction_agent_def_id?: string | null;
  polish_agent_def_id?: string | null;
  extraction_model_config_id?: string | null;
  extraction_prompt?: string;
  polish_model_config_id?: string | null;
  polish_prompt?: string;
};

async function pickDefaultModel(apiType: 'chat-completions' | 'vlm'): Promise<string | null> {
  const [preferred] = await db
    .select({ id: appModelConfigs.id })
    .from(appModelConfigs)
    .where(and(eq(appModelConfigs.apiType, apiType), eq(appModelConfigs.isDefault, true)))
    .limit(1);
  if (preferred) return preferred.id;

  const [anyModel] = await db
    .select({ id: appModelConfigs.id })
    .from(appModelConfigs)
    .where(eq(appModelConfigs.apiType, apiType))
    .limit(1);
  return anyModel?.id ?? null;
}

export async function seedBuiltinAgents(): Promise<void> {
  const existing = await db.select({ id: appBuiltinAgentDefs.id }).from(appBuiltinAgentDefs).limit(1);
  const seededByWorkflow = new Map<BuiltinWorkflowKey, string>();

  if (existing.length === 0) {
    const chatModelId = await pickDefaultModel('chat-completions');
    const vlmModelId = await pickDefaultModel('vlm');
    if (!chatModelId) {
      console.warn('[builtin-agents] Skipping seed: no chat-completions model configured.');
      return;
    }

    for (const seed of BUILTIN_AGENT_SEEDS) {
      const modelConfigId = seed.apiType === 'vlm' ? vlmModelId ?? chatModelId : chatModelId;
      const [row] = await db
        .insert(appBuiltinAgentDefs)
        .values({
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          workflowKey: seed.workflowKey,
          apiType: seed.apiType,
          modelConfigId,
          systemPrompt: seed.systemPrompt,
          userPromptTemplate: seed.userPromptTemplate,
          outputMode: seed.outputMode,
          outputSchema: seed.outputSchema ?? null,
          temperature: seed.temperature ?? null,
          isSystem: true,
          version: 1,
        })
        .returning({ id: appBuiltinAgentDefs.id, workflowKey: appBuiltinAgentDefs.workflowKey });
      seededByWorkflow.set(row.workflowKey as BuiltinWorkflowKey, row.id);
    }

    for (const [workflowKey, agentId] of seededByWorkflow) {
      await db.insert(appWorkflowBindings).values({
        workflowKey,
        builtinAgentDefId: agentId,
        enabled: true,
      });
    }

    console.log(`[builtin-agents] Seeded ${seededByWorkflow.size} system agents and workflow bindings.`);
  } else {
    const rows = await db
      .select({ id: appBuiltinAgentDefs.id, workflowKey: appBuiltinAgentDefs.workflowKey })
      .from(appBuiltinAgentDefs);
    for (const row of rows) {
      seededByWorkflow.set(row.workflowKey as BuiltinWorkflowKey, row.id);
    }
  }

  await migrateLegacyFaqSettings(seededByWorkflow);
}

async function migrateLegacyFaqSettings(
  defaults: Map<BuiltinWorkflowKey, string>,
): Promise<void> {
  const kbs = await db
    .select({ id: appKnowledgeBases.id, name: appKnowledgeBases.name, faqSettings: appKnowledgeBases.faqSettings })
    .from(appKnowledgeBases)
    .where(eq(appKnowledgeBases.type, 'faq'));

  for (const kb of kbs) {
    const settings = (kb.faqSettings ?? {}) as LegacyFaqSettings;
    let changed = false;
    const next: LegacyFaqSettings = {
      auto_index_on_publish: settings.auto_index_on_publish ?? false,
      extraction_agent_def_id: settings.extraction_agent_def_id ?? null,
      polish_agent_def_id: settings.polish_agent_def_id ?? null,
    };

    if (!next.extraction_agent_def_id && (settings.extraction_model_config_id || settings.extraction_prompt)) {
      const modelId = settings.extraction_model_config_id;
      const prompt = settings.extraction_prompt?.trim();
      const defaultExtractId = defaults.get('faq_extract');
      const defaultPrompt = BUILTIN_AGENT_SEEDS.find((s) => s.workflowKey === 'faq_extract')?.userPromptTemplate;

      if (modelId && prompt && defaultPrompt && prompt !== defaultPrompt) {
        const [created] = await db
          .insert(appBuiltinAgentDefs)
          .values({
            slug: `migrated-${kb.id.slice(0, 8)}-faq-extract`,
            name: `Migrated — ${kb.name} — FAQ extract`,
            description: 'Migrated from legacy KB faq_settings',
            workflowKey: 'faq_extract',
            apiType: 'chat-completions',
            modelConfigId: modelId,
            systemPrompt: 'You extract FAQ pairs from documents. Respond with valid JSON only.',
            userPromptTemplate: prompt,
            outputMode: 'json',
            temperature: '0.2',
            isSystem: false,
            version: 1,
          })
          .returning({ id: appBuiltinAgentDefs.id });
        next.extraction_agent_def_id = created.id;
      } else if (defaultExtractId) {
        next.extraction_agent_def_id = null;
      }
      changed = true;
    }

    if (!next.polish_agent_def_id && (settings.polish_model_config_id || settings.polish_prompt)) {
      const modelId = settings.polish_model_config_id;
      const prompt = settings.polish_prompt?.trim();
      const defaultPolishId = defaults.get('faq_polish');
      const defaultPrompt = BUILTIN_AGENT_SEEDS.find((s) => s.workflowKey === 'faq_polish')?.userPromptTemplate;

      if (modelId && prompt && defaultPrompt && prompt !== defaultPrompt) {
        const [created] = await db
          .insert(appBuiltinAgentDefs)
          .values({
            slug: `migrated-${kb.id.slice(0, 8)}-faq-polish`,
            name: `Migrated — ${kb.name} — FAQ polish`,
            description: 'Migrated from legacy KB faq_settings',
            workflowKey: 'faq_polish',
            apiType: 'chat-completions',
            modelConfigId: modelId,
            systemPrompt: '',
            userPromptTemplate: prompt,
            outputMode: 'text',
            temperature: '0.2',
            isSystem: false,
            version: 1,
          })
          .returning({ id: appBuiltinAgentDefs.id });
        next.polish_agent_def_id = created.id;
      } else if (defaultPolishId) {
        next.polish_agent_def_id = null;
      }
      changed = true;
    }

    if (changed) {
      await db
        .update(appKnowledgeBases)
        .set({ faqSettings: next, updatedAt: new Date() })
        .where(eq(appKnowledgeBases.id, kb.id));
    }
  }
}
