import { useEffect, useRef, useState } from 'react';
import type { FlueConversationMessage } from '@flue/react';

const THROTTLE_MS = 100;

/**
 * While the agent is busy, throttle message-driven renders so scroll/input stay responsive.
 * When the turn completes, flush to the latest messages immediately (no deferred lag).
 */
export function useThrottledMessages(
  messages: FlueConversationMessage[],
  busy: boolean,
): FlueConversationMessage[] {
  const [rendered, setRendered] = useState(messages);
  const lastFlushAtRef = useRef(0);
  const latestRef = useRef(messages);
  latestRef.current = messages;

  useEffect(() => {
    if (!busy) {
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
