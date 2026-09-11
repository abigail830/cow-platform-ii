/** Map legacy / alternate env var names to provider conventions. */
export function syncProviderEnv(): void {
  if (!process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_API_KEY) {
    process.env.AZURE_OPENAI_API_KEY = process.env.AZURE_API_KEY;
  }
  if (!process.env.AZURE_OPENAI_BASE_URL && process.env.AZURE_API_BASE) {
    process.env.AZURE_OPENAI_BASE_URL = process.env.AZURE_API_BASE;
  }
  process.env.AZURE_OPENAI_API_VERSION = 'v1';
}

export function registerModelProviders(): void {
  syncProviderEnv();
}
