import { cliInternalAuthHeader } from '../auth/cli-internal-auth.ts';

export type ModelCliParamsResponse = {
  model_id: string;
  config_name: string;
  api_type: string;
  base_url: string;
  model_name: string;
  api_key: string | null;
  max_concurrency: number | null;
};

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatVlmCliArgs(params: ModelCliParamsResponse): string {
  let args = '';
  if (params.base_url) args += ` --vlm-url ${shellQuote(params.base_url)}`;
  if (params.model_name) args += ` --model ${shellQuote(params.model_name)}`;
  if (params.api_key) args += ` --vlm-api-key ${shellQuote(params.api_key)}`;
  if (params.max_concurrency != null) args += ` --max-concurrency ${params.max_concurrency}`;
  return args;
}

export function formatExtractionCliArgs(params: ModelCliParamsResponse): string {
  let args = ` --extract-metadata --extraction-schema ${shellQuote('[]')}`;
  if (params.base_url) args += ` --extraction-model-base-url ${shellQuote(params.base_url)}`;
  if (params.model_name) args += ` --extraction-model-name ${shellQuote(params.model_name)}`;
  if (params.api_key) args += ` --extraction-api-key ${shellQuote(params.api_key)}`;
  return args;
}

/** Fetch CLI model params via internal API (no direct DB access). */
export async function fetchModelCliParams(
  apiUrl: string,
  query: { modelId?: string | null; modelName?: string | null; apiType?: string | null },
): Promise<ModelCliParamsResponse> {
  const auth = cliInternalAuthHeader();
  if (!auth) {
    throw new Error('OPENKMS_CLI_BASIC_USER and OPENKMS_CLI_BASIC_PASSWORD must be set');
  }

  const params = new URLSearchParams();
  if (query.modelId?.trim()) params.set('model_id', query.modelId.trim());
  if (query.modelName?.trim()) params.set('model_name', query.modelName.trim());
  if (query.apiType?.trim()) params.set('api_type', query.apiType.trim());

  const path = '/internal-api/models/cli-params';
  const url = `${apiUrl.replace(/\/$/, '')}${path}?${params.toString()}`;

  const res = await fetch(url, { headers: { Authorization: auth } });
  const data = (await res.json()) as ModelCliParamsResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Model CLI params request failed (${res.status})`);
  }
  return data;
}
