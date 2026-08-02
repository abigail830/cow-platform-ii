type TransientNoticeProps = {
  message: string | null;
  variant?: 'success' | 'info';
};

export function TransientNotice({ message, variant = 'success' }: TransientNoticeProps) {
  if (!message) return null;

  return (
    <div
      className={`app-transient-notice app-transient-notice-${variant}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
