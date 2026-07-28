import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type AgentInfo = {
  name: string;
  displayName: string;
};

export type Conversation = {
  id: string;
  userId: string;
  agentName: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function listAgents(): Promise<AgentInfo[]> {
  const data = await authFetch('/api/agents');
  return (data.agents ?? []) as AgentInfo[];
}

export async function listConversations(agentName: string): Promise<Conversation[]> {
  const data = await authFetch(`/api/conversations?agent=${encodeURIComponent(agentName)}`);
  return (data.conversations ?? []) as Conversation[];
}

export async function createConversation(agentName: string, title: string): Promise<Conversation> {
  const data = await authFetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName, title }),
  });
  return data.conversation as Conversation;
}

export async function patchConversation(id: string, title: string): Promise<Conversation> {
  const data = await authFetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return data.conversation as Conversation;
}
