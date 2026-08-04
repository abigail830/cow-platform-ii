import type { ResolvedBuiltinAgent } from './resolve-workflow-agent.ts';

/** Snapshot stored on pipeline/KB import jobs for worker LLM tasks (no api_key). */
export type WorkerLlmConfig = {
  model_config_id: string;
  system_prompt: string;
  user_prompt_template: string;
  output_schema?: Record<string, unknown> | null;
  agent_def_id?: string | null;
};

export const FAQ_EXTRACT_NOT_CONFIGURED =
  'No FAQ extraction agent is configured. Open KB Settings → AI tab and select an extraction agent, or ask an admin to set the platform default.';

export const METADATA_EXTRACT_NOT_CONFIGURED =
  'Metadata extraction is enabled for this channel but no agent is configured. Open Channel Settings → Pipeline and select a metadata extraction agent.';

export const WORKER_LLM_SNAPSHOT_MISSING =
  'This job has no extraction config snapshot. Create a new job after configuring the agent in Settings.';

export function resolvedAgentToWorkerLlmConfig(agent: ResolvedBuiltinAgent): WorkerLlmConfig {
  return {
    model_config_id: agent.modelConfigId,
    system_prompt: agent.systemPrompt,
    user_prompt_template: agent.userPromptTemplate,
    output_schema: agent.outputSchema,
    agent_def_id: agent.id,
  };
}

export function assertWorkerLlmConfig(
  config: WorkerLlmConfig | null | undefined,
  notConfiguredMessage: string,
): WorkerLlmConfig {
  const modelId = config?.model_config_id?.trim();
  if (!modelId) {
    throw new Error(notConfiguredMessage);
  }
  return {
    model_config_id: modelId,
    system_prompt: config?.system_prompt ?? '',
    user_prompt_template: config?.user_prompt_template ?? '',
    output_schema: config?.output_schema ?? null,
    agent_def_id: config?.agent_def_id ?? null,
  };
}

export function workerLlmConfigFromJobSnapshot(
  snapshot: WorkerLlmConfig | null | undefined,
): WorkerLlmConfig {
  const modelId = snapshot?.model_config_id?.trim();
  if (!modelId) {
    throw new Error(WORKER_LLM_SNAPSHOT_MISSING);
  }
  return {
    model_config_id: modelId,
    system_prompt: snapshot?.system_prompt ?? '',
    user_prompt_template: snapshot?.user_prompt_template ?? '',
    output_schema: snapshot?.output_schema ?? null,
    agent_def_id: snapshot?.agent_def_id ?? null,
  };
}
