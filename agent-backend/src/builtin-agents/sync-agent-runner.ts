import { eq } from 'drizzle-orm';
import {
  appKnowledgeBases,
  appModelConfigs,
  appSyncAgentMessages,
  appSyncAgentRuns,
  appWorkflowBindings,
  db,
  type BuiltinWorkflowKey,
  type SyncAgentTriggerType,
} from '../db/index.ts';
import { applyPromptTemplate } from './apply-template.ts';
import {
  resolveWorkflowAgent,
  type BuiltinAgentOverride,
  type ResolvedBuiltinAgent,
} from './resolve-workflow-agent.ts';
import { outboundFetch } from '../shared/outbound-fetch.ts';
import { callModelChatCompletion } from '../services/model-chat-completions.ts';
import { resolveModelCliParams } from '../services/model-cli-params.ts';

const AUDIT_CONTENT_MAX = 8000;
const LLM_TIMEOUT_MS = Number(process.env.SYNC_AGENT_TIMEOUT_MS ?? 120_000);

export type SyncAgentRunContext = {
  triggerType: SyncAgentTriggerType;
  triggeredBy?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  inputSummary?: string | null;
};

export type SyncAgentDraftDef = Partial<
  Pick<
    ResolvedBuiltinAgent,
    | 'modelConfigId'
    | 'systemPrompt'
    | 'userPromptTemplate'
    | 'outputMode'
    | 'outputSchema'
    | 'temperature'
    | 'maxTokens'
    | 'apiType'
  >
>;

export type SyncAgentInput = {
  workflowKey: BuiltinWorkflowKey;
  variables: Record<string, string>;
  override?: BuiltinAgentOverride;
  draft?: SyncAgentDraftDef;
  context: SyncAgentRunContext;
  image?: { mimeType: string; base64: string };
};

export type SyncAgentResult = {
  runId: string;
  rawText: string;
  parsed: unknown;
  latencyMs: number;
};

function parseTemperature(value: string | null | undefined): number {
  if (!value?.trim()) return 0.2;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0.2;
}

function mergeDraft(agent: ResolvedBuiltinAgent, draft?: SyncAgentDraftDef): ResolvedBuiltinAgent {
  if (!draft) return agent;
  return {
    ...agent,
    apiType: draft.apiType ?? agent.apiType,
    modelConfigId: draft.modelConfigId ?? agent.modelConfigId,
    systemPrompt: draft.systemPrompt ?? agent.systemPrompt,
    userPromptTemplate: draft.userPromptTemplate ?? agent.userPromptTemplate,
    outputMode: draft.outputMode ?? agent.outputMode,
    outputSchema: draft.outputSchema ?? agent.outputSchema,
    temperature: draft.temperature ?? agent.temperature,
    maxTokens: draft.maxTokens ?? agent.maxTokens,
  };
}

function stripJsonFences(raw: string): string {
  return raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}

function parseOutput(agent: ResolvedBuiltinAgent, rawText: string): unknown {
  if (agent.outputMode === 'json') {
    const jsonText = stripJsonFences(rawText);
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Extraction response must be a JSON array');
    const items: Array<{ question: string; answer: string }> = [];
    for (const row of parsed as Array<{ question?: string; answer?: string }>) {
      const question = row.question?.trim() ?? '';
      const answer = row.answer?.trim() ?? '';
      if (question && answer) items.push({ question, answer });
    }
    return items;
  }
  if (agent.outputMode === 'structured') {
    const jsonText = stripJsonFences(rawText);
    return JSON.parse(jsonText) as Record<string, unknown>;
  }
  return rawText.trim();
}

async function callChatCompletions(
  agent: ResolvedBuiltinAgent,
  userPrompt: string,
): Promise<{ rawText: string; messages: Array<{ role: string; content: string }> }> {
  const params = await resolveModelCliParams({
    modelId: agent.modelConfigId,
    expectedApiType: 'chat-completions',
  });

  const messages: Array<{ role: string; content: string }> = [];
  if (agent.systemPrompt.trim()) {
    messages.push({ role: 'system', content: agent.systemPrompt.trim() });
  }
  messages.push({ role: 'user', content: userPrompt });

  const rawText = await callModelChatCompletion({
    baseUrl: params.base_url,
    modelName: params.model_name,
    apiKey: params.api_key,
    configName: params.config_name,
    provider: params.provider,
    messages,
    temperature: parseTemperature(agent.temperature),
    maxTokens: agent.maxTokens,
    outputMode: agent.outputMode,
    extraConfig: params.extra_config,
    timeoutMs: LLM_TIMEOUT_MS,
  });

  return { rawText, messages };
}

async function callVlm(
  agent: ResolvedBuiltinAgent,
  userPrompt: string,
  image: { mimeType: string; base64: string },
): Promise<{ rawText: string; messages: Array<{ role: string; content: string }> }> {
  const params = await resolveModelCliParams({
    modelId: agent.modelConfigId,
    expectedApiType: 'vlm',
  });
  if (!params.base_url?.trim()) throw new Error('VLM model is missing baseUrl');

  const dataUrl = `data:${image.mimeType};base64,${image.base64}`;
  const url = `${params.base_url.replace(/\/$/, '')}/chat/completions`;

  const response = await outboundFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.api_key ? { Authorization: `Bearer ${params.api_key}` } : {}),
    },
    body: JSON.stringify({
      model: params.model_name,
      temperature: parseTemperature(agent.temperature),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    timeoutMs: LLM_TIMEOUT_MS,
    retries: 0,
    label: 'VLM',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`VLM failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  let rawText = '';
  if (typeof rawContent === 'string') {
    rawText = rawContent.trim();
  } else if (Array.isArray(rawContent)) {
    rawText = rawContent
      .map((part) => (part.type === 'text' ? part.text?.trim() ?? '' : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (!rawText) throw new Error('VLM returned empty content');

  return {
    rawText,
    messages: [{ role: 'user', content: userPrompt }],
  };
}

async function writeAudit(input: {
  agent: ResolvedBuiltinAgent;
  context: SyncAgentRunContext;
  status: 'success' | 'failed';
  latencyMs: number;
  errorMessage?: string;
  messages: Array<{ role: string; content: string }>;
  assistantContent?: string;
}): Promise<string> {
  const [run] = await db
    .insert(appSyncAgentRuns)
    .values({
      workflowKey: input.agent.workflowKey,
      builtinAgentDefId: input.agent.id,
      agentDefVersion: input.agent.version,
      triggerType: input.context.triggerType,
      triggeredBy: input.context.triggeredBy ?? null,
      resourceType: input.context.resourceType ?? null,
      resourceId: input.context.resourceId ?? null,
      status: input.status,
      latencyMs: input.latencyMs,
      errorMessage: input.errorMessage ?? null,
      inputSummary: input.context.inputSummary ?? null,
    })
    .returning({ id: appSyncAgentRuns.id });

  const runId = run.id;
  const rows: Array<{ runId: string; role: string; content: string }> = [];
  for (const message of input.messages) {
    rows.push({
      runId,
      role: message.role,
      content: message.content.slice(0, AUDIT_CONTENT_MAX),
    });
  }
  if (input.assistantContent) {
    rows.push({
      runId,
      role: 'assistant',
      content: input.assistantContent.slice(0, AUDIT_CONTENT_MAX),
    });
  }
  if (rows.length > 0) {
    await db.insert(appSyncAgentMessages).values(rows);
  }
  return runId;
}

export async function runSyncAgent(input: SyncAgentInput): Promise<SyncAgentResult> {
  const started = Date.now();
  const baseAgent = await resolveWorkflowAgent({
    workflowKey: input.workflowKey,
    override: input.override,
  });
  const agent = mergeDraft(baseAgent, input.draft);
  const userPrompt = applyPromptTemplate(agent.userPromptTemplate, input.variables);

  try {
    let rawText = '';
    let messages: Array<{ role: string; content: string }> = [];

    if (agent.apiType === 'vlm') {
      if (!input.image?.base64) throw new Error('Image input is required for VLM workflow');
      const result = await callVlm(agent, userPrompt, input.image);
      rawText = result.rawText;
      messages = result.messages;
    } else {
      const result = await callChatCompletions(agent, userPrompt);
      rawText = result.rawText;
      messages = result.messages;
    }

    const parsed = parseOutput(agent, rawText);
    const latencyMs = Date.now() - started;
    const runId = await writeAudit({
      agent,
      context: input.context,
      status: 'success',
      latencyMs,
      messages,
      assistantContent: rawText,
    });

    return { runId, rawText, parsed, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message = error instanceof Error ? error.message : 'Sync agent run failed';
    const runId = await writeAudit({
      agent,
      context: input.context,
      status: 'failed',
      latencyMs,
      errorMessage: message,
      messages: [{ role: 'user', content: userPrompt.slice(0, AUDIT_CONTENT_MAX) }],
    });
    throw Object.assign(new Error(message), { runId });
  }
}
