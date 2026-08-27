import { eq } from 'drizzle-orm';
import { appModelConfigs, db } from '../../db/index.ts';
import { decryptModelConfigApiKey } from '../../shared/model/model-config-secret.ts';

export type ModelCliParams = {
  model_id: string;
  config_name: string;
  api_type: string;
  base_url: string;
  model_name: string;
  api_key: string | null;
  max_concurrency: number | null;
  provider: string;
  extra_config: Record<string, unknown>;
};

function readMaxConcurrency(extraConfig: Record<string, unknown>): number | null {
  const raw = extraConfig.max_concurrency ?? extraConfig.maxConcurrency;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCliParams(row: typeof appModelConfigs.$inferSelect): ModelCliParams {
  const extraConfig = row.extraConfig ?? {};
  return {
    model_id: row.id,
    config_name: row.name,
    api_type: row.apiType,
    base_url: row.baseUrl?.trim() || '',
    model_name: row.modelId.trim(),
    api_key: decryptModelConfigApiKey(row.apiKey)?.trim() || null,
    max_concurrency: readMaxConcurrency(extraConfig),
    provider: row.provider,
    extra_config: extraConfig,
  };
}

/** Resolve platform model config into CLI connection fields (DB access isolated to internal API). */
export async function resolveModelCliParams(input: {
  modelId?: string | null;
  modelName?: string | null;
  expectedApiType?: string | null;
}): Promise<ModelCliParams> {
  const modelId = input.modelId?.trim();
  const modelName = input.modelName?.trim();

  if (!modelId && !modelName) {
    throw new Error('model_id or model_name is required');
  }

  const [row] = await db
    .select()
    .from(appModelConfigs)
    .where(modelId ? eq(appModelConfigs.id, modelId) : eq(appModelConfigs.name, modelName!))
    .limit(1);

  if (!row) throw new Error('Model config not found');

  if (input.expectedApiType && row.apiType !== input.expectedApiType) {
    throw new Error(`Model must be api type "${input.expectedApiType}"`);
  }

  return toCliParams(row);
}
