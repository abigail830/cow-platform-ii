const DEFAULT_TIMEOUT_MS = Number(process.env.SYNC_AGENT_TIMEOUT_MS ?? 120_000);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export type ChatMessage = { role: string; content: string };

export type ChatCompletionInput = {
  baseUrl: string;
  modelName: string;
  apiKey: string | null;
  configName?: string;
  provider?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number | null;
  outputMode?: string;
  extraConfig?: Record<string, unknown>;
  timeoutMs?: number;
};

type StreamParseResult = {
  content: string;
  reasoning: string;
};

export function normalizeChatBaseUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/$/, '');
  if (!base) return base;
  // DashScope native /api/v1 (ASR SDK) ≠ OpenAI-compatible chat; rewrite for chat/completions.
  if (/dashscope(?:-intl|-us)?\.aliyuncs\.com\/api\/v1$/i.test(base)) {
    return base.replace(/\/api\/v1$/i, '/compatible-mode/v1');
  }
  if (/\.maas\.aliyuncs\.com\/api\/v1$/i.test(base)) {
    return base.replace(/\/api\/v1$/i, '/compatible-mode/v1');
  }
  return base;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const base = normalizeChatBaseUrl(baseUrl);
  if (base.endsWith('/chat/completions')) return base;
  if (base.endsWith('/v1')) return `${base}/chat/completions`;
  // Zhipu GLM and similar providers use /v2, /v3, /v4 as the API root — not OpenAI /v1.
  if (/\/v\d+$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

export function shouldDisableThinking(baseUrl: string, modelName: string): boolean {
  const base = baseUrl.toLowerCase();
  const model = modelName.toLowerCase();
  if (base.includes('siliconflow')) return true;
  if (base.includes('dashscope') || base.includes('aliyuncs.com')) return true;
  if (model.includes('qwen3')) return true;
  return false;
}

export function shouldStreamChatCompletion(
  baseUrl: string,
  _modelName: string,
  extraConfig?: Record<string, unknown>,
): boolean {
  const explicit = extraConfig?.stream_chat ?? extraConfig?.streamChat;
  return explicit === true;
}

export function buildChatCompletionBody(input: {
  modelName: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number | null;
  outputMode?: string;
  baseUrl: string;
  stream: boolean;
  extraConfig?: Record<string, unknown>;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.modelName,
    messages: input.messages,
    stream: input.stream,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 1024,
  };

  if (input.outputMode === 'structured') {
    body.response_format = { type: 'json_object' };
  }

  const base = input.baseUrl.toLowerCase();
  const model = input.modelName.toLowerCase();
  if (shouldDisableThinking(input.baseUrl, input.modelName)) {
    body.enable_thinking = false;
  }
  if (base.includes('siliconflow') && model.includes('deepseek-v4')) {
    body.thinking = { type: 'disabled' };
    body.enable_thinking = false;
  }

  const providerOptions =
    input.extraConfig?.chat_completion_options ??
    input.extraConfig?.chatCompletionOptions;
  if (providerOptions && typeof providerOptions === 'object') {
    Object.assign(body, providerOptions);
  }

  return body;
}

function parseChatMessageContent(message: Record<string, unknown> | undefined): string {
  if (!message) return '';
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if (content) return content;
  const reasoning =
    typeof message.reasoning_content === 'string' ? message.reasoning_content.trim() : '';
  return reasoning;
}

async function readChatCompletionStream(
  response: Response,
  signal?: AbortSignal,
): Promise<StreamParseResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming response has no body');

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Chat completion stream read timed out', 'AbortError');
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
            message?: { content?: string; reasoning_content?: string };
          }>;
        };
        const choice = chunk.choices?.[0];
        const delta = choice?.delta ?? choice?.message;
        if (delta?.content) content += delta.content;
        if (delta?.reasoning_content) reasoning += delta.reasoning_content;
      } catch {
        // Ignore malformed SSE chunks.
      }
    }
  }

  return { content: content.trim(), reasoning: reasoning.trim() };
}

function pickStreamText(result: StreamParseResult): string {
  return result.content || result.reasoning;
}

async function parseErrorResponse(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof payload.error === 'string') return payload.error;
    if (payload.error?.message) return payload.error.message;
    if (payload.message) return payload.message;
  } catch {
    // fall through
  }
  return text.slice(0, 300);
}

function resolveTimeoutMs(input: ChatCompletionInput, stream: boolean): number {
  if (input.timeoutMs) return input.timeoutMs;
  const base = input.baseUrl.toLowerCase();
  const model = input.modelName.toLowerCase();
  if (stream || (base.includes('siliconflow') && model.includes('deepseek-v4'))) {
    return Math.max(DEFAULT_TIMEOUT_MS, 180_000);
  }
  return DEFAULT_TIMEOUT_MS;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callModelChatCompletion(input: ChatCompletionInput): Promise<string> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      `Model "${input.configName ?? input.modelName}" is missing an API key`,
    );
  }
  if (!input.baseUrl?.trim()) {
    throw new Error(`Model "${input.configName ?? input.modelName}" is missing baseUrl`);
  }

  const stream = shouldStreamChatCompletion(input.baseUrl, input.modelName, input.extraConfig);
  const url = chatCompletionsUrl(input.baseUrl);
  const label = `Chat completion (${input.configName ?? input.modelName})`;
  const timeoutMs = resolveTimeoutMs(input, stream);
  const body = buildChatCompletionBody({
    modelName: input.modelName,
    messages: input.messages,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    outputMode: input.outputMode,
    baseUrl: input.baseUrl,
    stream,
    extraConfig: input.extraConfig,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await parseErrorResponse(response);
        if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS - 1) {
          await sleep(600 * (attempt + 1));
          continue;
        }
        throw new Error(
          `Chat completion failed (${response.status}) for ${input.modelName} at ${url}: ${message}`,
        );
      }

      if (stream) {
        const parsed = await readChatCompletionStream(response, controller.signal);
        const text = pickStreamText(parsed);
        if (!text) throw new Error('Empty response from chat model');
        return text;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: Record<string, unknown> }>;
      };
      const text = parseChatMessageContent(data.choices?.[0]?.message);
      if (!text) throw new Error('Empty response from chat model');
      return text;
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error(`${label} failed for ${url}`);
      lastError = err.name === 'AbortError'
        ? new Error(`${label} timed out for ${url}`)
        : err;
      if (attempt < MAX_ATTEMPTS - 1 && err.name === 'AbortError') {
        await sleep(600 * (attempt + 1));
        continue;
      }
      if (attempt < MAX_ATTEMPTS - 1 && err.message.includes('(503)')) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`${label} failed for ${url}`);
}
