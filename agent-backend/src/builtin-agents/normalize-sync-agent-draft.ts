import type { SyncAgentDraftDef } from './sync-agent-runner.ts';

type DraftRecord = Record<string, unknown>;

function pickString(draft: DraftRecord, camel: string, snake: string): string | undefined {
  const value = draft[camel] ?? draft[snake];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickNullableString(
  draft: DraftRecord,
  camel: string,
  snake: string,
): string | null | undefined {
  if (!(camel in draft) && !(snake in draft)) return undefined;
  const value = draft[camel] ?? draft[snake];
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function pickNumber(draft: DraftRecord, camel: string, snake: string): number | null | undefined {
  if (!(camel in draft) && !(snake in draft)) return undefined;
  const value = draft[camel] ?? draft[snake];
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Accept API snake_case or internal camelCase draft payloads. */
export function normalizeSyncAgentDraft(
  draft: SyncAgentDraftDef | DraftRecord | null | undefined,
): SyncAgentDraftDef | undefined {
  if (!draft || typeof draft !== 'object') return undefined;

  const normalized: SyncAgentDraftDef = {
    modelConfigId: pickString(draft, 'modelConfigId', 'model_config_id'),
    apiType: pickString(draft, 'apiType', 'api_type'),
    systemPrompt: pickString(draft, 'systemPrompt', 'system_prompt'),
    userPromptTemplate: pickString(draft, 'userPromptTemplate', 'user_prompt_template'),
    outputMode: pickString(draft, 'outputMode', 'output_mode'),
    temperature: pickNullableString(draft, 'temperature', 'temperature'),
    maxTokens: pickNumber(draft, 'maxTokens', 'max_tokens'),
  };

  const hasValue = Object.values(normalized).some((value) => value !== undefined);
  return hasValue ? normalized : undefined;
}
