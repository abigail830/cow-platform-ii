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
  const withTemporal = appendTemporalContext(instructions, context, now);
  return appendSessionFilesContext(withTemporal);
}

function appendTemporalContext(
  instructions: string,
  context: AgentContextYaml | undefined,
  now: Date,
): string {
  if (!context?.temporal) return instructions;

  const timezone = context.timezone?.trim() || 'UTC';
  const formatted = formatAgentDateTime(now, timezone);

  return `${instructions}

## Temporal context

Current date and time (${timezone}): ${formatted}

Use this throughout the session when judging whether retrieved passages may be outdated, superseded, or time-bound.`;
}

function appendSessionFilesContext(instructions: string): string {
  return `${instructions}

## Session document attachments

Users may attach documents to this chat (shown in a \`SESSION_FILES\` block with fileId, filename, and size).

- Use \`list_session_files\` and \`read_session_file\` to load content. Do not guess file contents.
- If prior tool results in the conversation already contain the needed excerpts, reuse them; otherwise read again (including with \`offset\` when truncated).
- Use \`search_session_files\` to locate keywords across multiple attachments.
- Image attachments (if any) are separate from session documents and use the vision path when present in the message.`;
}
