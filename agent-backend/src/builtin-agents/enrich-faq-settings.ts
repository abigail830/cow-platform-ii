import type { KbFaqSettings } from '../db/schema.ts';
import { resolveKbFaqWorkflowAgent } from './resolve-workflow-agent.ts';
import { getPipelineConfigById } from '../shared/pipeline-config-store.ts';
import { resolveFaqExtractPipeline } from '../shared/faq-pipeline-binding.ts';

export type EnrichedKbFaqSettings = KbFaqSettings & {
  /** Populated from resolved polish agent for UI. */
  polish_model_config_id?: string | null;
  polish_prompt?: string;
  polish_configuration_error?: string | null;
  /** Resolved extract pipeline display name (override or platform default). */
  extract_pipeline_name?: string | null;
};

export async function enrichFaqSettingsForApi(
  kbId: string,
  settings: KbFaqSettings,
): Promise<EnrichedKbFaqSettings> {
  const base: EnrichedKbFaqSettings = {
    auto_index_on_publish: settings.auto_index_on_publish ?? false,
    polish_agent_def_id: settings.polish_agent_def_id ?? null,
    extract_pipeline_id: settings.extract_pipeline_id ?? null,
  };

  try {
    const extractPipeline = await resolveFaqExtractPipeline({
      extractPipelineId: settings.extract_pipeline_id,
    });
    base.extract_pipeline_id = settings.extract_pipeline_id ?? extractPipeline.id;
    base.extract_pipeline_name = extractPipeline.name;
  } catch {
    if (settings.extract_pipeline_id) {
      const named = await getPipelineConfigById(settings.extract_pipeline_id);
      base.extract_pipeline_name = named?.name ?? null;
    } else {
      base.extract_pipeline_name = null;
    }
  }

  try {
    const polishAgent = await resolveKbFaqWorkflowAgent(kbId, 'faq_polish');
    base.polish_model_config_id = polishAgent.modelConfigId;
    base.polish_prompt = polishAgent.userPromptTemplate;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    const message = `No FAQ polish agent is configured. Open KB Settings → Answer polish and select an agent, or ask an admin to set the platform default. (${detail})`;
    console.warn(`[faq-settings] kb=${kbId} polish agent resolve failed: ${message}`);
    base.polish_model_config_id = null;
    base.polish_prompt = '';
    base.polish_configuration_error = message;
  }

  return base;
}
