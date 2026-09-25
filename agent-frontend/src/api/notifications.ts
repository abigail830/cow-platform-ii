import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type UserNotificationAction = {
  type: string;
  label: string;
  payload: Record<string, unknown>;
};

export type UserNotification = {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  actions: UserNotificationAction[];
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function listNotifications(options?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<{ items: UserNotification[]; unread_count: number }> {
  const params = new URLSearchParams();
  if (options?.unreadOnly) params.set('unread_only', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const data = await authFetch(`/api/user/notifications${qs ? `?${qs}` : ''}`);
  return data as { items: UserNotification[]; unread_count: number };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await authFetch(`/api/user/notifications/${notificationId}/read`, { method: 'PATCH' });
}

export async function dismissNotification(notificationId: string): Promise<void> {
  await authFetch(`/api/user/notifications/${notificationId}/dismiss`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<number> {
  const data = await authFetch('/api/user/notifications/mark-all-read', { method: 'POST' });
  return (data.marked_count as number) ?? 0;
}
