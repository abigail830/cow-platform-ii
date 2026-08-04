import type { KbFaqSettings } from '../db/schema.ts';
import {
  resolveKbFaqWorkflowAgent,
  toLegacyFaqExtractionFields,
} from './resolve-workflow-agent.ts';

export type EnrichedKbFaqSettings = KbFaqSettings & {
  /** Legacy fields populated from resolved agents for CLI compatibility. */
  extraction_model_config_id?: string | null;
  extraction_prompt?: string;
  extraction_system_prompt?: string;
  polish_model_config_id?: string | null;
  polish_prompt?: string;
};

export async function enrichFaqSettingsForApi(
  kbId: string,
  settings: KbFaqSettings,
): Promise<EnrichedKbFaqSettings> {
  const base: EnrichedKbFaqSettings = {
    auto_index_on_publish: settings.auto_index_on_publish ?? false,
    extraction_agent_def_id: settings.extraction_agent_def_id ?? null,
    polish_agent_def_id: settings.polish_agent_def_id ?? null,
  };

  try {
    const extractAgent = await resolveKbFaqWorkflowAgent(kbId, 'faq_extract');
    const extractLegacy = toLegacyFaqExtractionFields(extractAgent);
    base.extraction_model_config_id = extractLegacy.extraction_model_config_id;
    base.extraction_prompt = extractLegacy.extraction_prompt;
    base.extraction_system_prompt = extractLegacy.extraction_system_prompt;
  } catch {
    base.extraction_model_config_id = null;
    base.extraction_prompt = '';
    base.extraction_system_prompt = '';
  }

  try {
    const polishAgent = await resolveKbFaqWorkflowAgent(kbId, 'faq_polish');
    base.polish_model_config_id = polishAgent.modelConfigId;
    base.polish_prompt = polishAgent.userPromptTemplate;
  } catch {
    base.polish_model_config_id = null;
    base.polish_prompt = '';
  }

  return base;
}
