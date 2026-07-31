import { useEffect, useRef, type RefObject } from 'react';

function isNearBottom(container: HTMLElement, threshold = 96): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

export function useChatAutoScroll(
  containerRef: RefObject<HTMLElement | null>,
  deps: unknown[],
  streaming: boolean,
): void {
  const userPinnedRef = useRef(false);
  const lastScrollAtRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      userPinnedRef.current = !isNearBottom(container);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || userPinnedRef.current) return;

    const now = Date.now();
    const minInterval = streaming ? 120 : 0;
    if (now - lastScrollAtRef.current < minInterval) return;
    lastScrollAtRef.current = now;

    const frame = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit scroll triggers only
  }, deps);
}
