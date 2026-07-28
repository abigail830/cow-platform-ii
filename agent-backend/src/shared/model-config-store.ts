import { and, asc, eq } from 'drizzle-orm';
import { appModelConfigs, db } from '../db/index.ts';

export type RuntimeModelConfig = {
  id: string;
  name: string;
  modelId: string;
  provider: string;
  apiType: string;
  capabilities: string[];
  baseUrl: string | null;
  apiKey: string | null;
  isDefault: boolean;
  extraConfig: Record<string, unknown>;
};

function toRuntimeModel(row: typeof appModelConfigs.$inferSelect): RuntimeModelConfig {
  return {
    id: row.id,
    name: row.name,
    modelId: row.modelId,
    provider: row.provider,
    apiType: row.apiType,
    capabilities: row.capabilities ?? [],
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    isDefault: row.isDefault,
    extraConfig: row.extraConfig ?? {},
  };
}

/** List all model configs for runtime consumers (includes API keys). */
export async function listRuntimeModelConfigs(): Promise<RuntimeModelConfig[]> {
  const rows = await db
    .select()
    .from(appModelConfigs)
    .orderBy(asc(appModelConfigs.apiType), asc(appModelConfigs.name));
  return rows.map(toRuntimeModel);
}

/** Resolve the default model for an API type, or null if none configured. */
export async function getDefaultModelConfig(apiType: string): Promise<RuntimeModelConfig | null> {
  const [row] = await db
    .select()
    .from(appModelConfigs)
    .where(and(eq(appModelConfigs.apiType, apiType), eq(appModelConfigs.isDefault, true)))
    .limit(1);
  return row ? toRuntimeModel(row) : null;
}

/** Resolve a model config by id for runtime consumers. */
export async function getModelConfigById(id: string): Promise<RuntimeModelConfig | null> {
  const [row] = await db.select().from(appModelConfigs).where(eq(appModelConfigs.id, id)).limit(1);
  return row ? toRuntimeModel(row) : null;
}
