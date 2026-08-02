import {
  buildOpenKmsSandboxEnv,
  readOpenKmsApiKeyHeader,
  resolveOpenKmsApiUrl,
} from './openkms-headers.ts';

const apiKeyByInstance = new Map<string, string>();

/** Remember Playground API key for a Flue agent instance (survives async submission processing). */
export function rememberOpenKmsApiKeyForInstance(instanceId: string, request: Request): void {
  const apiKey = readOpenKmsApiKeyHeader(request);
  if (!apiKey) return;
  apiKeyByInstance.set(instanceId, apiKey);
}

export function buildOpenKmsEnvForInstance(instanceId: string, request?: Request): Record<string, string> {
  const env: Record<string, string> = {
    OPENKMS_API_URL: request ? resolveOpenKmsApiUrl(request) : resolveOpenKmsApiUrl(),
  };

  const fromRequest = request ? buildOpenKmsSandboxEnv(request) : {};
  if (fromRequest.OPENKMS_API_KEY) {
    env.OPENKMS_API_KEY = fromRequest.OPENKMS_API_KEY;
    return env;
  }

  const stored = apiKeyByInstance.get(instanceId);
  if (stored) {
    env.OPENKMS_API_KEY = stored;
  }

  return env;
}

export function resetOpenKmsInstanceEnvForTests(): void {
  apiKeyByInstance.clear();
}
