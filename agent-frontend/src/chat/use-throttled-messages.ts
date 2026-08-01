import { useEffect, useRef, useState } from 'react';
import type { FlueConversationMessage } from '@flue/react';

const THROTTLE_MS = 100;

/** Structural changes (new parts, tool state) flush immediately; text deltas stay throttled. */
function messagesStructureKey(messages: FlueConversationMessage[]): string {
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  if (!lastAssistant) return '';

  return lastAssistant.parts
    .map((part) => {
      if (part.type === 'dynamic-tool') {
        return `tool:${part.toolCallId}:${part.state}`;
      }
      if (part.type === 'text' || part.type === 'reasoning') {
        return `${part.type}:${part.state}`;
      }
      return part.type;
    })
    .join('|');
}

/**
 * While visible parts stream, throttle message-driven renders so scroll/input stay responsive.
 * When streaming stops, flush to the latest messages immediately (no deferred lag).
 */
export function useThrottledMessages(
  messages: FlueConversationMessage[],
  busy: boolean,
): FlueConversationMessage[] {
  const [rendered, setRendered] = useState(messages);
  const lastFlushAtRef = useRef(0);
  const latestRef = useRef(messages);
  const structureKeyRef = useRef(messagesStructureKey(messages));
  latestRef.current = messages;

  useEffect(() => {
    if (!busy) {
      setRendered(messages);
      structureKeyRef.current = messagesStructureKey(messages);
      return;
    }

    const structureKey = messagesStructureKey(messages);
    const structureChanged = structureKey !== structureKeyRef.current;
    if (structureChanged) {
      structureKeyRef.current = structureKey;
      lastFlushAtRef.current = Date.now();
      setRendered(messages);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastFlushAtRef.current;
    if (elapsed >= THROTTLE_MS) {
      lastFlushAtRef.current = now;
      setRendered(messages);
      return;
    }

    const timer = window.setTimeout(() => {
      lastFlushAtRef.current = Date.now();
      setRendered(latestRef.current);
    }, THROTTLE_MS - elapsed);

    return () => window.clearTimeout(timer);
  }, [messages, busy]);

  return busy ? rendered : messages;
}
