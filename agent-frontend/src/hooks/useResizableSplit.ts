import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

const DEFAULT_MIN_PCT = 22;
const DEFAULT_MAX_PCT = 58;

export type ResizableSplitOptions = {
  minPct?: number;
  maxPct?: number;
  /** Allow the left panel to collapse to 0% via the split handle. */
  collapsibleLeft?: boolean;
};

export function useResizableSplit(
  storageKey: string,
  defaultLeftPct = 32,
  options?: ResizableSplitOptions,
) {
  const minPct = options?.minPct ?? DEFAULT_MIN_PCT;
  const maxPct = options?.maxPct ?? DEFAULT_MAX_PCT;
  const collapsibleLeft = options?.collapsibleLeft ?? false;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const leftPctRef = useRef(defaultLeftPct);
  const preCollapseLeftPctRef = useRef(defaultLeftPct);

  const [isDragging, setIsDragging] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const [leftPct, setLeftPct] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? Number(stored) : defaultLeftPct;
    if (!Number.isFinite(parsed)) return defaultLeftPct;
    if (collapsibleLeft && parsed <= 0) return 0;
    return Math.min(maxPct, Math.max(minPct, parsed));
  });

  leftPctRef.current = leftPct;

  useEffect(() => {
    if (collapsibleLeft && leftPct <= 0) {
      setLeftCollapsed(true);
    }
  }, [collapsibleLeft, leftPct]);

  const onHandleMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const collapseLeft = useCallback(() => {
    if (leftPctRef.current > 0) {
      preCollapseLeftPctRef.current = leftPctRef.current;
    }
    setLeftCollapsed(true);
    setLeftPct(0);
    localStorage.setItem(storageKey, '0');
  }, [storageKey]);

  const expandLeft = useCallback(() => {
    setLeftCollapsed(false);
    const restore = preCollapseLeftPctRef.current;
    const next = Math.min(maxPct, Math.max(minPct, restore));
    setLeftPct(next);
    localStorage.setItem(storageKey, String(next));
  }, [maxPct, minPct, storageKey]);

  const resetLeftSize = useCallback(() => {
    setLeftCollapsed(false);
    setLeftPct(defaultLeftPct);
    localStorage.setItem(storageKey, String(defaultLeftPct));
  }, [defaultLeftPct, storageKey]);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = ((event.clientX - rect.left) / rect.width) * 100;

      const collapsed = collapsibleLeft && leftPctRef.current <= 0;

      if (collapsibleLeft && collapsed && next > 1.5) {
        setLeftCollapsed(false);
      }

      const floor = collapsibleLeft && collapsed ? 0 : minPct;
      let clamped = Math.min(maxPct, Math.max(floor, next));
      if (collapsibleLeft && clamped > 0 && collapsed) {
        setLeftCollapsed(false);
      }
      if (collapsibleLeft && clamped <= 0) {
        clamped = 0;
        setLeftCollapsed(true);
      }
      setLeftPct(clamped);
    }

    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (collapsibleLeft && leftPctRef.current <= 0) {
        setLeftCollapsed(true);
        setLeftPct(0);
        localStorage.setItem(storageKey, '0');
        return;
      }

      if (collapsibleLeft && leftPctRef.current > 0) {
        preCollapseLeftPctRef.current = leftPctRef.current;
        setLeftCollapsed(false);
      }
      localStorage.setItem(storageKey, String(leftPctRef.current));
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [collapsibleLeft, maxPct, minPct, storageKey]);

  return {
    containerRef,
    leftPct,
    isDragging,
    leftCollapsed,
    onHandleMouseDown,
    collapseLeft,
    expandLeft,
    resetLeftSize,
  };
}
