import { eq } from 'drizzle-orm';
import { appModelConfigs, db } from '../../db/index.ts';
import { resolveModelCliParams } from '../../services/model-cli-params.ts';
import type { ModelConfigResolver, ModelConnection } from '../ports.ts';

function toConnection(
  params: Awaited<ReturnType<typeof resolveModelCliParams>>,
  extraConfig: Record<string, unknown>,
): ModelConnection {
  return {
    modelId: params.model_id,
    configName: params.config_name,
    baseUrl: params.base_url,
    modelName: params.model_name,
    apiKey: params.api_key,
    extraConfig,
  };
}

async function loadModelConnection(modelConfigId: string, expectedApiType: string): Promise<ModelConnection> {
  const params = await resolveModelCliParams({ modelId: modelConfigId, expectedApiType });
  const [row] = await db
    .select({ extraConfig: appModelConfigs.extraConfig })
    .from(appModelConfigs)
    .where(eq(appModelConfigs.id, modelConfigId))
    .limit(1);
  return toConnection(params, row?.extraConfig ?? {});
}

export function createModelConfigResolver(): ModelConfigResolver {
  return {
    resolveEmbeddingModel(modelConfigId) {
      return loadModelConnection(modelConfigId, 'embeddings');
    },
    resolveRerankModel(modelConfigId) {
      return loadModelConnection(modelConfigId, 'rerank');
    },
  };
}
