type DynamicToolPart = Extract<import('@flue/react').FlueConversationPart, { type: 'dynamic-tool' }>;

export function isEmptyRecord(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

/** Flue may persist arrays as { "0": ..., "1": ... } — normalize for display. */
export function normalizeToolPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
    return keys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => record[key]);
  }
  return value;
}

const TOOL_STATE_RANK: Record<DynamicToolPart['state'], number> = {
  'input-available': 0,
  'output-available': 1,
  'output-error': 2,
};

export function mergeToolPart(current: DynamicToolPart, incoming: DynamicToolPart): DynamicToolPart {
  return TOOL_STATE_RANK[incoming.state] >= TOOL_STATE_RANK[current.state] ? incoming : current;
}

export function formatToolBody(tool: DynamicToolPart): string {
  if (tool.state === 'input-available' && isEmptyRecord(tool.input)) {
    return 'Preparing arguments…';
  }
  if (tool.state === 'output-error') {
    return String(tool.errorText ?? 'Tool failed');
  }

  const lines: string[] = [];
  if (!isEmptyRecord(tool.input)) {
    lines.push('Input:', JSON.stringify(normalizeToolPayload(tool.input), null, 2));
  }
  if (tool.state === 'output-available') {
    const output = normalizeToolPayload(tool.output);
    if (output !== undefined && !isEmptyRecord(output)) {
      if (lines.length > 0) lines.push('');
      lines.push('Output:', JSON.stringify(output, null, 2));
    } else if (lines.length === 0) {
      lines.push('(no output)');
    }
  }
  return lines.join('\n');
}
