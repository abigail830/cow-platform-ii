import { registerProvider } from '@flue/runtime';
import type { RuntimeModelConfig } from './model-config-store.ts';
import { syncProviderEnv } from '../providers.ts';
import {
  ensureQwenOpenCodeGoCatalogEntry,
  qwenCatalogTemplateId,
} from './model-qwen-catalog-overlay.ts';

const CHAT_AGENT_API_TYPES = new Set(['chat-completions']);

function providerIdForConfig(config: RuntimeModelConfig): string {
  return `okf-model-${config.id.replace(/-/g, '')}`;
}

function isQwenAlibabaMaaSConfig(config: RuntimeModelConfig): boolean {
  const provider = config.provider.trim().toLowerCase();
  if (
    provider.includes('qwen') ||
    provider.includes('alibaba') ||
    provider.includes('dashscope')
  ) {
    return true;
  }

  const baseUrl = config.baseUrl?.trim();
  if (!baseUrl) return false;

  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname.includes('aliyuncs.com') || hostname.includes('dashscope');
  } catch {
    return false;
  }
}

function isAzureHostedModelConfig(config: RuntimeModelConfig): boolean {
  const provider = config.provider.trim().toLowerCase();
  if (provider.includes('azure')) return true;

  const baseUrl = config.baseUrl?.trim();
  if (!baseUrl) return false;

  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return (
      hostname.endsWith('.openai.azure.com') ||
      hostname.endsWith('.cognitiveservices.azure.com') ||
      hostname.endsWith('.ai.azure.com')
    );
  } catch {
    return false;
  }
}

function resolveApiSlug(config: RuntimeModelConfig): string {
  const provider = config.provider.trim().toLowerCase();
  if (provider.includes('anthropic')) return 'anthropic';
  if (isAzureHostedModelConfig(config)) return 'azure-openai-responses';
  if (CHAT_AGENT_API_TYPES.has(config.apiType)) return 'openai-completions';
  throw new Error(
    `Model config "${config.name}" uses apiType "${config.apiType}" which is not supported for chat agents`,
  );
}

function requireBaseUrl(config: RuntimeModelConfig): string {
  const baseUrl = config.baseUrl?.trim();
  if (!baseUrl) {
    throw new Error(`Model config "${config.name}" is missing baseUrl`);
  }
  return baseUrl;
}

/** Prefer Flue/pi-ai catalog provider IDs so tool-capable models keep full metadata. */
function catalogProviderIdForConfig(config: RuntimeModelConfig): string | null {
  if (isAzureHostedModelConfig(config)) return 'azure-openai-responses';
  const provider = config.provider.trim().toLowerCase();
  if (provider.includes('siliconflow')) return 'siliconflow';
  if (provider === 'openai') return 'openai';
  if (isQwenAlibabaMaaSConfig(config)) return 'opencode-go';
  return null;
}

function registerConfigProvider(config: RuntimeModelConfig): string {
  if (isAzureHostedModelConfig(config)) {
    syncProviderEnv();
  }

  const catalogProviderId = catalogProviderIdForConfig(config);
  const providerId = catalogProviderId ?? providerIdForConfig(config);
  const modelId = config.modelId.trim();

  if (catalogProviderId === 'opencode-go') {
    ensureQwenOpenCodeGoCatalogEntry(modelId, qwenCatalogTemplateId(modelId));
  }

  registerProvider(providerId, {
    api:
      catalogProviderId === 'opencode-go'
        ? 'openai-completions'
        : resolveApiSlug(config),
    baseUrl: requireBaseUrl(config),
    ...(config.apiKey?.trim() ? { apiKey: config.apiKey.trim() } : {}),
  });
  return `${providerId}/${modelId}`;
}

/** Map an Admin model config row to a Flue model specifier string. */
export function resolveFlueModelFromConfig(config: RuntimeModelConfig): string {
  if (!CHAT_AGENT_API_TYPES.has(config.apiType)) {
    throw new Error(
      `Model config "${config.name}" must be apiType chat-completions for chat agents`,
    );
  }
  return registerConfigProvider(config);
}
