import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { useMemo, type ReactNode } from 'react';
import { ChatLinkResolveContext } from '../chat/chat-link-resolve-context.ts';
import { isImageMediaType } from '../chat/prompt-images.ts';
import { assistantMessageText, userMessageText } from '../chat/groupMessages.ts';
import {
  buildArtifactHrefResolver,
  extractPublishedArtifacts,
} from '../chat/published-artifacts.ts';
import { MessageCopyButton } from './MessageCopyButton.tsx';

type UserMessageBubbleProps = {
  message: FlueConversationMessage;
};

type UserFilePart = Extract<FlueConversationPart, { type: 'file' }>;

function userImageParts(message: FlueConversationMessage): UserFilePart[] {
  return message.parts.filter(
    (part): part is UserFilePart => part.type === 'file' && isImageMediaType(part.mediaType),
  );
}

export function UserMessageBubble({ message }: UserMessageBubbleProps) {
  const text = userMessageText(message).trim();
  const images = userImageParts(message);

  return (
    <div className="message-stack user">
      <div className="message user">
        {text ? <p>{text}</p> : null}
        {images.length > 0 ? (
          <div className="user-message-images">
            {images.map((part, index) => (
              <img
                key={`${part.url ?? part.filename ?? 'image'}-${index}`}
                className="user-message-image"
                src={part.url}
                alt={part.filename ?? 'Uploaded image'}
              />
            ))}
          </div>
        ) : null}
      </div>
      {text ? <MessageCopyButton text={text} /> : null}
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
