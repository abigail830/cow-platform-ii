import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type AsrHotword = {
  id: string;
  text: string;
  weight: number;
  lang: string | null;
  note: string | null;
  channel_ids: string[];
  created_at: string;
  updated_at: string;
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
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        res.ok ? 'Invalid JSON response from server' : text.slice(0, 200) || `HTTP ${res.status}`,
      );
    }
  }
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function listAsrHotwords(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ hotwords: AsrHotword[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams();
  if (params?.search?.trim()) query.set('search', params.search.trim());
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authFetch(`/api/admin/asr-hotwords${suffix}`);
  return {
    hotwords: (data.hotwords as AsrHotword[]) ?? [],
    total: Number(data.total ?? 0),
    page: Number(data.page ?? 1),
    limit: Number(data.limit ?? 50),
  };
}

export async function createAsrHotword(input: {
  text: string;
  weight: number;
  lang?: string | null;
  note?: string | null;
  channel_ids?: string[];
}): Promise<AsrHotword> {
  const data = await authFetch('/api/admin/asr-hotwords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: input.text,
      weight: input.weight,
      lang: input.lang,
      note: input.note,
      channel_ids: input.channel_ids ?? [],
    }),
  });
  return data.hotword as AsrHotword;
}

export async function updateAsrHotword(
  id: string,
  input: {
    text?: string;
    weight?: number;
    lang?: string | null;
    note?: string | null;
    channel_ids?: string[];
  },
): Promise<AsrHotword> {
  const data = await authFetch(`/api/admin/asr-hotwords/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.hotword as AsrHotword;
}

export async function deleteAsrHotword(id: string): Promise<void> {
  await authFetch(`/api/admin/asr-hotwords/${id}`, { method: 'DELETE' });
}
