import type { ThinkingLevel } from '@earendil-works/pi-agent-core';

const THINKING_LEVELS = new Set<ThinkingLevel>([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return THINKING_LEVELS.has(normalized as ThinkingLevel)
    ? (normalized as ThinkingLevel)
    : undefined;
}
