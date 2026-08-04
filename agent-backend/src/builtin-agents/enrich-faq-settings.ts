import type { KbFaqSettings } from '../db/schema.ts';
import {
  resolveKbFaqWorkflowAgent,
  toLegacyFaqExtractionFields,
} from './resolve-workflow-agent.ts';
import { FAQ_EXTRACT_NOT_CONFIGURED, resolvedAgentToWorkerLlmConfig, type WorkerLlmConfig } from './worker-llm-config.ts';

export type EnrichedKbFaqSettings = KbFaqSettings & {
  /** Populated from resolved agents for UI/worker compatibility. */
  extraction_model_config_id?: string | null;
  extraction_prompt?: string;
  extraction_system_prompt?: string;
  polish_model_config_id?: string | null;
  polish_prompt?: string;
  configuration_error?: string | null;
  extraction_configuration_error?: string | null;
  polish_configuration_error?: string | null;
};

function formatAgentResolveError(workflow: 'faq_extract' | 'faq_polish', error: unknown): string {
  const detail = error instanceof Error ? error.message : 'Unknown error';
  if (workflow === 'faq_extract') {
    return `${FAQ_EXTRACT_NOT_CONFIGURED} (${detail})`;
  }
  return `No FAQ polish agent is configured. Open KB Settings → AI tab and select a polish agent, or ask an admin to set the platform default. (${detail})`;
}

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
  } catch (error) {
    const message = formatAgentResolveError('faq_extract', error);
    console.warn(`[faq-settings] kb=${kbId} extraction agent resolve failed: ${message}`);
    base.extraction_model_config_id = null;
    base.extraction_prompt = '';
    base.extraction_system_prompt = '';
    base.extraction_configuration_error = message;
    base.configuration_error = message;
  }

  try {
    const polishAgent = await resolveKbFaqWorkflowAgent(kbId, 'faq_polish');
    base.polish_model_config_id = polishAgent.modelConfigId;
    base.polish_prompt = polishAgent.userPromptTemplate;
  } catch (error) {
    const message = formatAgentResolveError('faq_polish', error);
    console.warn(`[faq-settings] kb=${kbId} polish agent resolve failed: ${message}`);
    base.polish_model_config_id = null;
    base.polish_prompt = '';
    base.polish_configuration_error = message;
  }

  return base;
}

export async function resolveKbFaqExtractWorkerConfig(kbId: string): Promise<WorkerLlmConfig> {
  const agent = await resolveKbFaqWorkflowAgent(kbId, 'faq_extract');
  return resolvedAgentToWorkerLlmConfig(agent);
}
