import type { FlueConversationPart } from '@flue/react';
import { formatToolBody } from './tool-payload.ts';

type DynamicToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;

export function foldEventLabel(raw: string): string {
  return raw
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function isPartStreaming(part: FlueConversationPart): boolean {
  if (part.type === 'text' || part.type === 'reasoning') return part.state === 'streaming';
  if (part.type === 'dynamic-tool') return part.state === 'input-available';
  return false;
}

export function partFoldLabel(part: FlueConversationPart): string {
  switch (part.type) {
    case 'text':
      return part.state === 'streaming' ? 'Text' : 'Text';
    case 'reasoning':
      return part.state === 'streaming' ? 'Thinking…' : 'Reasoning';
    case 'dynamic-tool': {
      const tool = part as DynamicToolPart;
      if (tool.state === 'input-available') return `Tool · ${tool.toolName}…`;
      if (tool.state === 'output-error') return `Tool · ${tool.toolName} failed`;
      return `Tool · ${tool.toolName}`;
    }
    default:
      if (part.type.startsWith('data-')) return foldEventLabel(part.type.slice(5));
      return foldEventLabel(part.type);
  }
}

export function partBodyText(part: FlueConversationPart): string {
  switch (part.type) {
    case 'text':
    case 'reasoning':
      return part.text;
    case 'dynamic-tool':
      return formatToolBody(part as DynamicToolPart);
    default: {
      if (part.type.startsWith('data-')) {
        const payload = (part as { data?: unknown }).data;
        return JSON.stringify(payload, null, 2);
      }
      return JSON.stringify(part, null, 2);
    }
  }
}
