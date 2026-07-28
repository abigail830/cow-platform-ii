import { formatApiError } from './http.ts';

export type UserRole = 'user' | 'operator' | 'admin';

export type PermissionGrant = {
  key: string;
  label: string;
  category: string;
  accessLevel: 'read' | 'write';
  routePatterns: string[];
  apiPatterns: string[];
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  roles?: string[];
  permissions?: PermissionGrant[];
};

const TOKEN_KEY = 'agent_platform_token';
const USER_KEY = 'agent_platform_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error('Backend unavailable — is agent-backend running on :8787?');
    }
    throw new Error(`Empty response from server (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid server response (HTTP ${res.status})`);
  }
}

export async function login(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJsonResponse<{ token?: string; user?: AuthUser; error?: string }>(res);
  if (!res.ok) throw new Error(formatApiError(data.error, 'Login failed'));
  if (!data.token || !data.user) throw new Error('Login response missing token or user');
  setSession(data.token, data.user);
  return data.user;
}

export async function fetchMe(): Promise<AuthUser> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJsonResponse<{ user?: AuthUser; error?: string }>(res);
  if (!res.ok) throw new Error(formatApiError(data.error, 'Unauthorized'));
  if (!data.user) throw new Error('Invalid session response');
  return data.user;
}
