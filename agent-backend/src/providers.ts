import { registerProvider } from '@flue/runtime';

/** Map legacy / alternate env var names to Pi built-in provider conventions. */
export function syncProviderEnv(): void {
  if (!process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_API_KEY) {
    process.env.AZURE_OPENAI_API_KEY = process.env.AZURE_API_KEY;
  }
  if (!process.env.AZURE_OPENAI_BASE_URL && process.env.AZURE_API_BASE) {
    process.env.AZURE_OPENAI_BASE_URL = process.env.AZURE_API_BASE;
  }
  // Pi azure-openai-responses uses api-version=v1 (not 2024-xx-preview chat versions).
  process.env.AZURE_OPENAI_API_VERSION = 'v1';
}

export function registerModelProviders(): void {
  syncProviderEnv();

  if (process.env.OPENAI_API_KEY) {
    registerProvider('openai', {
      api: 'openai-completions',
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  if (process.env.SILICONFLOW_API_KEY) {
    registerProvider('siliconflow', {
      api: 'openai-completions',
      baseUrl: process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1',
      apiKey: process.env.SILICONFLOW_API_KEY,
    });
  }
}
