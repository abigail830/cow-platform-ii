import { useCallback, useEffect, useRef, useState } from 'react';

export type TransientNoticeVariant = 'success' | 'info' | 'error';

type NoticeState = {
  message: string;
  variant: TransientNoticeVariant;
};

export function useTransientNotice(durationMs = 4000) {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNotice = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setNotice(null);
  }, []);

  const showNotice = useCallback(
    (message: string, variant: TransientNoticeVariant = 'success') => {
      const trimmed = message.trim();
      if (!trimmed) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setNotice({ message: trimmed, variant });
      timerRef.current = setTimeout(() => {
        setNotice(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => clearNotice(), [clearNotice]);

  return {
    notice: notice?.message ?? null,
    noticeVariant: notice?.variant ?? 'success',
    showNotice,
    clearNotice,
  };
}
