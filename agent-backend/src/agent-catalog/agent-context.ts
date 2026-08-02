import type { AgentContextYaml } from './schema.ts';

/** ISO-like local datetime in the given IANA timezone. */
export function formatAgentDateTime(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

export function augmentInstructionsWithAgentContext(
  instructions: string,
  context: AgentContextYaml | undefined,
  now = new Date(),
): string {
  if (!context?.temporal) return instructions;

  const timezone = context.timezone?.trim() || 'UTC';
  const formatted = formatAgentDateTime(now, timezone);

  return `${instructions}

## Temporal context

Current date and time (${timezone}): ${formatted}

Use this throughout the session when judging whether retrieved passages may be outdated, superseded, or time-bound.`;
}
