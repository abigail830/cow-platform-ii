import { useCallback, useEffect, useRef, useState } from 'react';

export function useTransientNotice(durationMs = 4000) {
  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNotice = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setNotice(null);
  }, []);

  const showNotice = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setNotice(trimmed);
      timerRef.current = setTimeout(() => {
        setNotice(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => clearNotice(), [clearNotice]);

  return { notice, showNotice, clearNotice };
}
