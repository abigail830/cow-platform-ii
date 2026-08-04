import { outboundFetch } from '../../shared/outbound-fetch.ts';

export type RerankApiStyle = 'cohere_compatible' | 'openai_reranks' | 'dashscope_native';

export function resolveRerankApiStyle(input: {
  modelId: string;
  baseUrl: string | null;
  extraConfig?: Record<string, unknown>;
}): RerankApiStyle {
  const explicit = input.extraConfig?.rerank_api_style ?? input.extraConfig?.rerankApiStyle;
  if (explicit === 'cohere_compatible' || explicit === 'openai_reranks' || explicit === 'dashscope_native') {
    return explicit;
  }

  const base = (input.baseUrl ?? '').toLowerCase();
  if (base.includes('dashscope') || base.includes('aliyuncs.com') || base.includes('maas.aliyuncs.com')) {
    if (base.includes('compatible')) return 'openai_reranks';
    return 'dashscope_native';
  }
  return 'cohere_compatible';
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/$/, '');
  if (path.startsWith('/')) return `${base}${path}`;
  return `${base}/${path}`;
}

function rerankEndpoint(baseUrl: string, style: RerankApiStyle): string {
  if (style === 'openai_reranks') {
    if (baseUrl.includes('/compatible-api/v1')) return joinUrl(baseUrl, '/reranks');
    if (baseUrl.endsWith('/v1')) return joinUrl(baseUrl, '/reranks');
    return joinUrl(baseUrl, '/compatible-api/v1/reranks');
  }
  if (style === 'dashscope_native') {
    return joinUrl(baseUrl, '/services/rerank/text-rerank/text-rerank');
  }
  if (baseUrl.endsWith('/v1')) return joinUrl(baseUrl, '/rerank');
  return joinUrl(baseUrl, '/v1/rerank');
}

type RerankRequestInput = {
  modelName: string;
  query: string;
  documents: string[];
  topN: number;
  instruct?: string | null;
  style: RerankApiStyle;
};

function buildRerankBody(input: RerankRequestInput): Record<string, unknown> {
  if (input.style === 'dashscope_native') {
    const parameters: Record<string, unknown> = { top_n: input.topN };
    if (input.instruct?.trim()) parameters.instruct = input.instruct.trim();
    return {
      model: input.modelName,
      input: { query: input.query, documents: input.documents },
      parameters,
    };
  }

  const body: Record<string, unknown> = {
    model: input.modelName,
    query: input.query,
    documents: input.documents,
    top_n: input.topN,
  };

  if (input.style === 'openai_reranks') {
    if (input.instruct?.trim()) body.instruct = input.instruct.trim();
  } else if (input.instruct?.trim()) {
    body.instruction = input.instruct.trim();
  }

  return body;
}

function parseRerankResults(payload: Record<string, unknown>): Array<{ index: number; score: number }> {
  const direct = payload.results;
  if (Array.isArray(direct)) {
    return direct.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        index: Number(row.index),
        score: Number(row.relevance_score ?? row.score ?? 0),
      };
    });
  }

  const output = payload.output as Record<string, unknown> | undefined;
  const nested = output?.results;
  if (Array.isArray(nested)) {
    return nested.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        index: Number(row.index),
        score: Number(row.relevance_score ?? row.score ?? 0),
      };
    });
  }

  throw new Error('Rerank API returned unexpected response shape');
}

export async function callRerankApi(input: {
  baseUrl: string;
  apiKey: string | null;
  modelName: string;
  query: string;
  documents: string[];
  topN: number;
  instruct?: string | null;
  extraConfig?: Record<string, unknown>;
  timeoutMs?: number;
  configName?: string;
}): Promise<Array<{ index: number; score: number }>> {
  const style = resolveRerankApiStyle({
    modelId: input.modelName,
    baseUrl: input.baseUrl,
    extraConfig: input.extraConfig,
  });

  const url = rerankEndpoint(input.baseUrl, style);
  const label = `Rerank API (${input.configName ?? input.modelName})`;

  const response = await outboundFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey ?? 'no-key'}`,
    },
    body: JSON.stringify(
      buildRerankBody({
        modelName: input.modelName,
        query: input.query,
        documents: input.documents,
        topN: input.topN,
        instruct: input.instruct,
        style,
      }),
    ),
    timeoutMs: input.timeoutMs ?? 30_000,
    retries: 2,
    label,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
  };

  if (!response.ok) {
    const message =
      (typeof payload.error === 'object' && payload.error?.message) ||
      (typeof payload.error === 'string' ? payload.error : null) ||
      `Rerank API failed (${response.status})`;
    throw new Error(message);
  }

  return parseRerankResults(payload);
}
