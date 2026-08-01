import type { FlueConversationMessage } from '@flue/react';
import type { ReactNode } from 'react';
import { assistantMessageText, userMessageText } from '../chat/groupMessages.ts';
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
};

export function AssistantMessageBubble({ messages, children }: AssistantMessageBubbleProps) {
  const text = assistantMessageText(messages);

  return (
    <div className="message-stack assistant">
      <div className="message assistant">{children}</div>
      <MessageCopyButton text={text} />
    </div>
  );
}
