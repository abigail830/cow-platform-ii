export const DEFAULT_E2B_SESSION_TIMEOUT_MS = 5 * 60 * 1000;

export function readE2bApiKey(): string {
  const apiKey = process.env.E2B_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('E2B_API_KEY is required when sandbox.provider is e2b');
  }
  return apiKey;
}

export function readE2bSessionTimeoutMs(): number {
  const raw = process.env.E2B_SESSION_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_E2B_SESSION_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('E2B_SESSION_TIMEOUT_MS must be a positive number');
  }
  return Math.floor(parsed);
}

export function e2bSessionLifecycle() {
  return {
    onTimeout: 'kill' as const,
    autoResume: false,
  };
}
