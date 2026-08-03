export const AGENT_API_KEY_STORAGE_KEY = 'openkms_agent_api_key';

const CHANGE_EVENT = 'openkms:agent-api-key-change';

export function getAgentApiKey(): string | null {
  return localStorage.getItem(AGENT_API_KEY_STORAGE_KEY)?.trim() || null;
}

export function isAgentApiKeyConfigured(): boolean {
  return getAgentApiKey() !== null;
}

function notifyAgentApiKeyChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeAgentApiKey(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function setAgentApiKey(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    localStorage.removeItem(AGENT_API_KEY_STORAGE_KEY);
    notifyAgentApiKeyChange();
    return;
  }
  localStorage.setItem(AGENT_API_KEY_STORAGE_KEY, trimmed);
  notifyAgentApiKeyChange();
}

export function clearAgentApiKey(): void {
  localStorage.removeItem(AGENT_API_KEY_STORAGE_KEY);
  notifyAgentApiKeyChange();
}

/** Header name — must match agent-backend `OPENKMS_API_KEY_HEADER`. */
export const OPENKMS_API_KEY_HEADER = 'x-openkms-api-key';
