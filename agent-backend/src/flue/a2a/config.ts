export function isA2aEnabledForSpec(spec: { a2a?: { enabled?: boolean } | null }): boolean {
  if (!spec.a2a) return false;
  return spec.a2a.enabled !== false;
}

export function a2aChannelName(agentId: string): string {
  return `${agentId}-a2a`;
}

export function readPublicApiUrl(): string {
  const configured =
    process.env.OPENKMS_API_URL?.trim() ||
    process.env.A2A_PUBLIC_BASE_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT ?? 8787}`;
  return configured.replace(/\/$/, '');
}

export function readA2aApiKey(): string | undefined {
  const key = process.env.A2A_API_KEY?.trim();
  return key || undefined;
}

export function readA2aServiceUserId(): string | undefined {
  const id = process.env.A2A_SERVICE_USER_ID?.trim();
  return id || undefined;
}

export const A2A_SERVICE_USER_EMAIL = 'a2a-service@internal';
