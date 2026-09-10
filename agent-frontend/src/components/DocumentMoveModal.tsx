import { useMemo, useState } from 'react';
import type { DocumentChannel } from '../api/documentChannels.ts';
import { listWritableChannelMoveOptions } from '../shared/channel-access.ts';

type DocumentMoveModalProps = {
  itemName: string;
  currentChannelId: string;
  channels: DocumentChannel[];
  onCancel: () => void;
  onSubmit: (channelId: string) => Promise<void>;
};

export function DocumentMoveModal({
  itemName,
  currentChannelId,
  channels,
  onCancel,
  onSubmit,
}: DocumentMoveModalProps) {
  const options = useMemo(
    () => listWritableChannelMoveOptions(channels, currentChannelId),
    [channels, currentChannelId],
  );

  const [channelId, setChannelId] = useState(options[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!channelId) {
      setError('Select a destination channel');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(channelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move item');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card model-config-form"
        role="dialog"
        aria-labelledby="knowledge-move-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="knowledge-move-title">Move to channel</h2>
        <p className="admin-form-hint">
          Move <strong>{itemName}</strong> to another channel. Parsed artifacts stay in place.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>Destination channel</span>
              <select
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                required
                disabled={options.length === 0}
                autoFocus
              >
                {options.length === 0 ? (
                  <option value="">No other writable channels</option>
                ) : (
                  options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || options.length === 0}>
              {busy ? 'Moving…' : 'Move'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
