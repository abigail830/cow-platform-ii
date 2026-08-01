import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type ExplorerSessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type ExplorerSession = {
  id: string;
  title: string | null;
  agentName: string;
  userId: string;
  user: ExplorerSessionUser;
  turnCount: number;
  updatedAt: string;
  createdAt: string;
};

export type ExplorerMessage = {
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
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

export type SessionExplorerQuery = {
  agent: string;
  from: string;
  to: string;
  sessionId?: string;
  keyword?: string;
};

export async function listExplorerSessions(
  query: SessionExplorerQuery,
): Promise<{ sessions: ExplorerSession[]; isAdmin: boolean }> {
  const params = new URLSearchParams({
    agent: query.agent,
    from: query.from,
    to: query.to,
  });
  if (query.sessionId?.trim()) params.set('sessionId', query.sessionId.trim());
  if (query.keyword?.trim()) params.set('keyword', query.keyword.trim());

  const data = await authFetch(`/api/session-explorer/sessions?${params.toString()}`);
  return {
    sessions: (data.sessions ?? []) as ExplorerSession[],
    isAdmin: Boolean(data.isAdmin),
  };
}

export async function getExplorerSessionMessages(conversationId: string): Promise<{
  session: ExplorerSession;
  messages: ExplorerMessage[];
}> {
  const data = await authFetch(`/api/session-explorer/sessions/${encodeURIComponent(conversationId)}/messages`);
  return {
    session: data.session as ExplorerSession,
    messages: (data.messages ?? []) as ExplorerMessage[],
  };
}
