export type FlueLiveMode = 'sse' | 'long-poll';

export function resolveFlueLiveMode(): FlueLiveMode {
  const raw = import.meta.env.VITE_FLUE_LIVE_MODE?.trim();
  if (raw === 'sse' || raw === 'long-poll') return raw;
  return 'sse';
}
