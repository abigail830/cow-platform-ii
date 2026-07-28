import type { ReactNode } from 'react';
import type { FlueConversationPart } from '@flue/react';
import { Markdown } from './Markdown.tsx';

type DynamicToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;

function foldLabel(raw: string): string {
  return raw
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function FoldBlock({
  label,
  streaming = false,
  children,
}: {
  label: string;
  streaming?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={`fold-block${streaming ? ' streaming' : ''}`}>
      <summary className="fold-block-summary">{label}</summary>
      <div className="fold-block-body">{children}</div>
    </details>
  );
}

export function MessagePart({ part }: { part: FlueConversationPart }) {
  switch (part.type) {
    case 'text':
      return (
        <div className={part.state === 'streaming' ? 'text-part streaming' : 'text-part'}>
          <Markdown>{part.text}</Markdown>
        </div>
      );

    case 'reasoning':
      if (!part.text.trim()) return null;
      return (
        <FoldBlock label={part.state === 'streaming' ? 'Thinking…' : 'Reasoning'} streaming={part.state === 'streaming'}>
          <pre>{part.text}</pre>
        </FoldBlock>
      );

    case 'dynamic-tool': {
      const tool = part as DynamicToolPart;
      const label =
        tool.state === 'input-available'
          ? `${tool.toolName}…`
          : tool.state === 'output-error'
            ? `${tool.toolName} failed`
            : tool.toolName;
      return (
        <FoldBlock label={`Tool · ${label}`}>
          <pre>
            {tool.state === 'output-available' || tool.state === 'output-error'
              ? JSON.stringify(tool.output ?? tool.errorText ?? tool.input, null, 2)
              : JSON.stringify(tool.input, null, 2)}
          </pre>
        </FoldBlock>
      );
    }

    default: {
      if (part.type.startsWith('data-')) {
        const eventName = part.type.slice(5);
        const payload = (part as { type: string; data?: unknown }).data;
        return (
          <FoldBlock label={foldLabel(eventName)}>
            <pre>{JSON.stringify(payload, null, 2)}</pre>
          </FoldBlock>
        );
      }
      return null;
    }
  }
}
