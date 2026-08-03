import type { FlueConversationMessage } from '@flue/react';
import { useMemo, type ReactNode } from 'react';
import { ChatLinkResolveContext } from '../chat/chat-link-resolve-context.ts';
import { assistantMessageText, userMessageText } from '../chat/groupMessages.ts';
import {
  buildArtifactHrefResolver,
  extractPublishedArtifacts,
} from '../chat/published-artifacts.ts';
import { MessageCopyButton } from './MessageCopyButton.tsx';

type UserMessageBubbleProps = {
  message: FlueConversationMessage;
};

export function UserMessageBubble({ message }: UserMessageBubbleProps) {
  const text = userMessageText(message);

  return (
    <div className="message-stack user">
      <div className="message user">
        <p>{text}</p>
      </div>
      <MessageCopyButton text={text} />
    </div>
  );
}

type AssistantMessageBubbleProps = {
  messages: FlueConversationMessage[];
  children: ReactNode;
  showCopy?: boolean;
};

export function AssistantMessageBubble({
  messages,
  children,
  showCopy = true,
}: AssistantMessageBubbleProps) {
  const text = assistantMessageText(messages);
  const resolveLinkHref = useMemo(
    () => buildArtifactHrefResolver(extractPublishedArtifacts(messages)),
    [messages],
  );

  return (
    <ChatLinkResolveContext.Provider value={resolveLinkHref}>
      <div className="message-stack assistant">
        <div className="message assistant">{children}</div>
        {showCopy ? <MessageCopyButton text={text} /> : null}
      </div>
    </ChatLinkResolveContext.Provider>
  );
}
