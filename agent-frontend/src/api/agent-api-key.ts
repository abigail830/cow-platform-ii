export const AGENT_API_KEY_STORAGE_KEY = 'openkms_agent_api_key';

export function getAgentApiKey(): string | null {
  return localStorage.getItem(AGENT_API_KEY_STORAGE_KEY)?.trim() || null;
}

export function setAgentApiKey(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    localStorage.removeItem(AGENT_API_KEY_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AGENT_API_KEY_STORAGE_KEY, trimmed);
}

export function clearAgentApiKey(): void {
  localStorage.removeItem(AGENT_API_KEY_STORAGE_KEY);
}

/** Header name — must match agent-backend `OPENKMS_API_KEY_HEADER`. */
export const OPENKMS_API_KEY_HEADER = 'x-openkms-api-key';
