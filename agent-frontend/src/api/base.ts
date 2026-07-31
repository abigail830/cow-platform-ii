/**
 * API origin for browser requests.
 * - Empty in local dev → relative `/api/...` (Vite proxy to :8787).
 * - Set on Vercel → browser calls backend directly (avoids broken Edge proxy on 202).
 */
export function apiUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`apiUrl expects an absolute path starting with / (${path})`);
  }
  const origin = import.meta.env.VITE_API_ORIGIN?.trim().replace(/\/$/, '') ?? '';
  return origin ? `${origin}${path}` : path;
}

export function flueApiBaseUrl(): string {
  return apiUrl('/api');
}
