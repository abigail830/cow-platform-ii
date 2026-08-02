/** Header sent by Playground (from localStorage) for agent sandbox API key passthrough. */
export const OPENKMS_API_KEY_HEADER = 'x-openkms-api-key';

export function readOpenKmsApiKeyHeader(request: Request): string | undefined {
  const value = request.headers.get(OPENKMS_API_KEY_HEADER)?.trim();
  return value || undefined;
}

export function resolveOpenKmsApiUrl(request?: Request): string {
  const fromEnv = process.env.OPENKMS_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (request) {
    try {
      const url = new URL(request.url);
      return `${url.protocol}//${url.host}`;
    } catch {
      // fall through
    }
  }

  return 'http://127.0.0.1:8787';
}

export function buildOpenKmsSandboxEnv(request: Request): Record<string, string> {
  const env: Record<string, string> = {
    OPENKMS_API_URL: resolveOpenKmsApiUrl(request),
  };
  const apiKey = readOpenKmsApiKeyHeader(request);
  if (apiKey) {
    env.OPENKMS_API_KEY = apiKey;
  }
  return env;
}
