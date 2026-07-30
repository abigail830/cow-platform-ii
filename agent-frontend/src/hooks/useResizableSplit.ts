import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

const DEFAULT_MIN_PCT = 22;
const DEFAULT_MAX_PCT = 58;

export type ResizableSplitOptions = {
  minPct?: number;
  maxPct?: number;
};

export function useResizableSplit(
  storageKey: string,
  defaultLeftPct = 32,
  options?: ResizableSplitOptions,
) {
  const minPct = options?.minPct ?? DEFAULT_MIN_PCT;
  const maxPct = options?.maxPct ?? DEFAULT_MAX_PCT;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const leftPctRef = useRef(defaultLeftPct);

  const [leftPct, setLeftPct] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? Number(stored) : defaultLeftPct;
    if (!Number.isFinite(parsed)) return defaultLeftPct;
    return Math.min(maxPct, Math.max(minPct, parsed));
  });

  leftPctRef.current = leftPct;

  const onHandleMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(maxPct, Math.max(minPct, next));
      setLeftPct(clamped);
    }

    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(storageKey, String(leftPctRef.current));
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [maxPct, minPct, storageKey]);

  return { containerRef, leftPct, onHandleMouseDown };
}
