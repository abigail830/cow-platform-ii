import { useFlueAgent } from '@flue/react';
import { useDeferredValue, useEffect, useMemo, useRef, type RefObject } from 'react';
import { isAgentBusy } from '../chat/agentStatus.ts';
import { sendMessageWithAdmissionRetry } from '../chat/agent-send-retry.ts';
import { resolveFlueLiveMode } from '../chat/flue-live-mode.ts';
import { isAwaitingAssistantResponse } from '../chat/assistant-turn.ts';
import { filterRenderableParts, groupMessages, mergeAssistantParts, partRenderKey, userMessageText } from '../chat/groupMessages.ts';
import { shouldShowTypingIndicator } from '../chat/typing-indicator.ts';
import { useChatAutoScroll } from '../chat/use-chat-auto-scroll.ts';
import { MessagePart } from '../chat/MessagePart.tsx';
import { toAgentInstanceId } from '../shared/agent-instance-id.ts';
import { AssistantInProgress } from './AssistantInProgress.tsx';
import { ChatComposer } from './ChatComposer.tsx';
import { TypingIndicator } from './TypingIndicator.tsx';

const FLUE_LIVE_MODE = resolveFlueLiveMode();

type AgentChatPanelProps = {
  agentName: string;
  conversationId: string;
  userId: string;
  initialMessage?: string | null;
  onInitialMessageSent?: () => void;
  onTitleFromMessage?: (title: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  onBusyChange?: (busy: boolean) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
};

export function AgentChatPanel({
  agentName,
  conversationId,
  userId,
  initialMessage,
  onInitialMessageSent,
  onTitleFromMessage,
  input,
  onInputChange,
  onBusyChange,
  messagesEndRef,
}: AgentChatPanelProps) {
  const agentInstanceId = useMemo(
    () => toAgentInstanceId(userId, conversationId),
    [userId, conversationId],
  );

  const agent = useFlueAgent({
    name: agentName,
    id: agentInstanceId,
    live: FLUE_LIVE_MODE,
  });

  const busy = isAgentBusy(agent.status);
  const renderMessages = useDeferredValue(agent.messages);
  const turns = useMemo(() => groupMessages(renderMessages), [renderMessages]);
  const showTypingIndicator = shouldShowTypingIndicator(agent.status, agent.messages);
  const awaitingAssistant = isAwaitingAssistantResponse(agent.status, agent.messages);
  const initialSentRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useChatAutoScroll(
    messagesContainerRef,
    [renderMessages, showTypingIndicator, awaitingAssistant, agent.error],
    busy,
  );

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    initialSentRef.current = false;
  }, [conversationId, agentInstanceId]);

  useEffect(() => {
    const text = initialMessage?.trim();
    if (!text || initialSentRef.current || !agent.historyReady) return;
    initialSentRef.current = true;
    void sendMessageWithAdmissionRetry((m) => agent.sendMessage(m), text)
      .then(() => {
        onTitleFromMessage?.(text.slice(0, 48));
        onInitialMessageSent?.();
      })
      .catch((err) => console.error('[chat] initial send failed', err));
  }, [
    initialMessage,
    agent.historyReady,
    agent.sendMessage,
    onTitleFromMessage,
    onInitialMessageSent,
  ]);

  async function onSend() {
    const text = input.trim();
    if (!text || busy || !agent.historyReady) return;
    onInputChange('');
    try {
      await sendMessageWithAdmissionRetry((m) => agent.sendMessage(m), text);
      onTitleFromMessage?.(text.slice(0, 48));
    } catch (err) {
      console.error('[chat] send failed', err);
    }
  }

  return (
    <>
      <div className="chat-messages" ref={messagesContainerRef}>
        <div className="chat-column">
          {!agent.historyReady && agent.messages.length === 0 && (
            <p className="empty">Loading conversation…</p>
          )}
          {agent.historyReady && turns.length === 0 && !initialMessage && (
            <p className="empty">
              Start a conversation
            </p>
          )}
          {turns.map((turn, turnIndex) => {
            if (turn.kind === 'user') {
              return (
                <div key={turn.message.id} className="message user">
                  <p>{userMessageText(turn.message)}</p>
                </div>
              );
            }
            const parts = filterRenderableParts(mergeAssistantParts(turn.messages));
            const isLatestTurn = turnIndex === turns.length - 1;
            const showInProgress = busy && isLatestTurn && parts.length === 0;
            return (
              <div key={turn.messages[0]?.id ?? 'assistant'} className="message assistant">
                {parts.map((part, index) => (
                  <MessagePart key={partRenderKey(part, index)} part={part} />
                ))}
                {showInProgress && <AssistantInProgress status={agent.status} />}
              </div>
            );
          })}
          {awaitingAssistant && (
            <div className="message assistant">
              <AssistantInProgress status={agent.status} />
            </div>
          )}
          {showTypingIndicator && !awaitingAssistant && <TypingIndicator />}
          {agent.error && <p className="error inline">{agent.error.message}</p>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatComposer
        value={input}
        onChange={onInputChange}
        onSend={() => void onSend()}
        disabled={!agent.historyReady}
        busy={busy}
      />
    </>
  );
}
