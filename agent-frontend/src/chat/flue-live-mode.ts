export type FlueLiveMode = 'sse' | 'long-poll';

type FlueLiveModeEnv = {
  VITE_FLUE_LIVE_MODE?: string;
  VITE_FLUE_ALLOW_SSE?: string;
  PROD?: boolean;
};

/**
 * Live updates on Vercel serverless cannot use in-process SSE:
 * admission/work runs in another instance, and a held SSE connection
 * blocks later history reads. Production therefore defaults to long-poll
 * even if `VITE_FLUE_LIVE_MODE=sse` is left in the Vercel project env.
 */
export function resolveFlueLiveMode(env: FlueLiveModeEnv = import.meta.env): FlueLiveMode {
  const raw = env.VITE_FLUE_LIVE_MODE?.trim();
  const allowSse = env.VITE_FLUE_ALLOW_SSE?.trim() === '1';
  if (env.PROD && raw === 'sse' && !allowSse) return 'long-poll';
  if (raw === 'sse' || raw === 'long-poll') return raw;
  return env.PROD ? 'long-poll' : 'sse';
}
