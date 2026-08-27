import { getModelConfigByName } from './model-config-store.ts';
import { parseThinkingLevel } from './thinking-level.ts';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';

/** Agent-wide override from agent.yaml, else model config extraConfig. */
export async function resolveAgentThinkingLevel(input: {
  configName?: string;
  yamlThinkingLevel?: string | undefined;
}): Promise<ThinkingLevel | undefined> {
  const fromYaml = parseThinkingLevel(input.yamlThinkingLevel);
  if (fromYaml) return fromYaml;

  const configName = input.configName?.trim();
  if (!configName) return undefined;

  const row = await getModelConfigByName(configName);
  if (!row) return undefined;

  const extra = row.extraConfig ?? {};
  return (
    parseThinkingLevel(extra.thinkingLevel) ??
    parseThinkingLevel(extra.thinking_level)
  );
}
