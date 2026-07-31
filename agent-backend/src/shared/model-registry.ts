import {
  getModelConfigByName,
  listRuntimeModelConfigs,
  type RuntimeModelConfig,
} from './model-config-store.ts';
import { resolveFlueModelFromConfig } from './model-flue-binding.ts';

const CACHE_TTL_MS = 60_000;

let cacheLoadedAt = 0;
let configsByName = new Map<string, RuntimeModelConfig>();

function isCacheFresh(): boolean {
  return configsByName.size > 0 && Date.now() - cacheLoadedAt < CACHE_TTL_MS;
}

export async function refreshModelConfigCache(): Promise<void> {
  const rows = await listRuntimeModelConfigs();
  configsByName = new Map(rows.map((row) => [row.name, row]));
  cacheLoadedAt = Date.now();
}

export async function ensureModelConfigCache(): Promise<void> {
  if (!isCacheFresh()) {
    await refreshModelConfigCache();
  }
}

export function getCachedModelConfigByName(name: string): RuntimeModelConfig | undefined {
  return configsByName.get(name.trim());
}

export async function lookupModelConfigByName(name: string): Promise<RuntimeModelConfig | null> {
  await ensureModelConfigCache();
  const cached = getCachedModelConfigByName(name);
  if (cached) return cached;
  const row = await getModelConfigByName(name);
  if (row) configsByName.set(row.name, row);
  return row;
}

export async function resolveFlueModelFromConfigName(configName: string): Promise<string> {
  const config = await lookupModelConfigByName(configName);
  if (!config) {
    throw new Error(`Model config not found: "${configName}"`);
  }
  return resolveFlueModelFromConfig(config);
}

export function resetModelConfigCacheForTests(): void {
  cacheLoadedAt = 0;
  configsByName = new Map();
}

export function invalidateModelConfigCache(): void {
  cacheLoadedAt = 0;
}

export function listCachedModelConfigNames(): string[] {
  return [...configsByName.keys()].sort();
}
