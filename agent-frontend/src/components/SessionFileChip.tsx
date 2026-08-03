import { Loader2, X } from 'lucide-react';
import { formatSessionFileSize, type SessionFileStatus } from '../chat/session-files.ts';
import { iconProps } from './icons/icon-props.ts';

type SessionFileChipProps = {
  filename: string;
  sizeBytes: number;
  includedInContext: boolean;
  status?: SessionFileStatus;
  errorMessage?: string;
  onToggleIncluded?: () => void;
  onRemove?: () => void;
  variant?: 'composer' | 'message';
};

export function SessionFileChip({
  filename,
  sizeBytes,
  includedInContext,
  status,
  errorMessage,
  onToggleIncluded,
  onRemove,
  variant = 'composer',
}: SessionFileChipProps) {
  const sizeLabel = formatSessionFileSize(sizeBytes);
  const processing = status === 'processing';
  const errored = status === 'error';

  return (
    <span
      className={`chat-session-file-chip${variant === 'composer' ? ' chat-session-file-chip-composer' : ''}${includedInContext ? '' : ' chat-session-file-chip-muted'}${processing ? ' chat-session-file-chip-processing' : ''}${errored ? ' chat-session-file-chip-error' : ''}`}
    >
      {processing ? (
        <span className="chat-session-file-chip-status" aria-live="polite">
          <Loader2 {...iconProps({ size: 14, className: 'icon-btn-spin' })} aria-hidden />
          <span className="chat-session-file-chip-name">{filename}</span>
          <span className="chat-session-file-chip-size">Processing…</span>
        </span>
      ) : (
        <button
          type="button"
          className="chat-session-file-chip-button"
          disabled={!onToggleIncluded || errored}
          title={
            errored
              ? errorMessage ?? 'Failed to process file'
              : onToggleIncluded
                ? includedInContext
                  ? 'Included in context (click to exclude)'
                  : 'Excluded from context (click to include)'
                : `${filename} (${sizeLabel})`
          }
          aria-label={errored ? `${filename}: ${errorMessage ?? 'Failed'}` : `${filename}, ${sizeLabel}`}
          onClick={onToggleIncluded}
        >
          <span className="chat-session-file-chip-name">{filename}</span>
          <span className="chat-session-file-chip-size">
            {errored ? 'Failed' : sizeLabel}
          </span>
        </button>
      )}
      {onRemove ? (
        <button
          type="button"
          className="chat-session-file-chip-remove"
          onClick={onRemove}
          title="Remove document"
          aria-label="Remove document"
          disabled={processing}
        >
          <X {...iconProps({ size: 14 })} />
        </button>
      ) : null}
    </span>
  );
}
