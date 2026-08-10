import { memo, type ReactNode } from 'react';
import type { FlueConversationPart } from '@flue/react';
import { Markdown } from './Markdown.tsx';
import { usePublishedArtifacts } from './published-artifacts-context.ts';
import { rewritePublishedArtifactMarkdownLinks } from './published-artifacts.ts';
import { isPartStreaming, partBodyText, partFoldLabel } from './part-labels.ts';

type DynamicToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;

function FoldBlock({
  label,
  streaming = false,
  children,
}: {
  label: string;
  streaming?: boolean;
  children: ReactNode;
}) {
  // Default collapsed; body stays mounted so expand shows live streaming / tool I/O.
  return (
    <details className={`fold-block${streaming ? ' streaming' : ''}`}>
      <summary className="fold-block-summary">{label}</summary>
      <div className="fold-block-body">{children}</div>
    </details>
  );
}

function StreamingPre({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <pre className={streaming ? 'streaming-pre' : undefined}>
      {text}
      {streaming && text.length === 0 ? '\u00a0' : null}
    </pre>
  );
}

function partsEqual(a: FlueConversationPart, b: FlueConversationPart): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;

  if (a.type === 'text' && b.type === 'text') {
    return a.text === b.text && a.state === b.state;
  }

  if (a.type === 'reasoning' && b.type === 'reasoning') {
    return a.text === b.text && a.state === b.state;
  }

  if (a.type === 'dynamic-tool') {
    const left = a as DynamicToolPart;
    const right = b as DynamicToolPart;
    return (
      left.toolCallId === right.toolCallId &&
      left.toolName === right.toolName &&
      left.state === right.state &&
      left.input === right.input &&
      left.output === right.output &&
      left.errorText === right.errorText
    );
  }

  return false;
}

function MessagePartView({ part }: { part: FlueConversationPart }) {
  const streaming = isPartStreaming(part);
  const publishedArtifacts = usePublishedArtifacts();

  switch (part.type) {
    case 'text': {
      const markdownSource =
        part.text.length > 0
          ? rewritePublishedArtifactMarkdownLinks(part.text, publishedArtifacts)
          : '';
      return (
        <div className={`text-part${streaming ? ' streaming' : ''}`}>
          {markdownSource ? <Markdown>{markdownSource}</Markdown> : null}
        </div>
      );
    }

    case 'reasoning':
      return (
        <FoldBlock label={partFoldLabel(part)} streaming={streaming}>
          <StreamingPre text={part.text} streaming={streaming} />
        </FoldBlock>
      );

    case 'dynamic-tool': {
      const tool = part as DynamicToolPart;
      return (
        <FoldBlock label={partFoldLabel(part)} streaming={streaming}>
          <StreamingPre text={partBodyText(tool)} streaming={streaming} />
        </FoldBlock>
      );
    }

    case 'file': {
      const filePart = part as Extract<FlueConversationPart, { type: 'file' }>;
      return (
        <FoldBlock label={`File · ${filePart.filename ?? filePart.mediaType}`}>
          {filePart.url ? (
            <a href={filePart.url} target="_blank" rel="noreferrer">
              {filePart.filename ?? 'Download attachment'}
            </a>
          ) : (
            <StreamingPre text={JSON.stringify(filePart, null, 2)} streaming={false} />
          )}
        </FoldBlock>
      );
    }

    default:
      return (
        <FoldBlock label={partFoldLabel(part)} streaming={streaming}>
          <StreamingPre text={partBodyText(part)} streaming={streaming} />
        </FoldBlock>
      );
  }
}

export const MessagePart = memo(MessagePartView, (left, right) => partsEqual(left.part, right.part));
