import { useMemo, useState } from 'react';
import type { DocumentChannel } from '../api/documentChannels.ts';
import { flattenChannels } from '../api/documentChannels.ts';

type DocumentMoveModalProps = {
  documentName: string;
  currentChannelId: string;
  channels: DocumentChannel[];
  onCancel: () => void;
  onSubmit: (channelId: string) => Promise<void>;
};

function channelLabel(channel: DocumentChannel, depth: number): string {
  const indent = depth > 0 ? `${'  '.repeat(depth)}` : '';
  return `${indent}${channel.name}`;
}

function channelDepth(channels: DocumentChannel[], targetId: string, depth = 0): number {
  for (const channel of channels) {
    if (channel.id === targetId) return depth;
    if (channel.children.length > 0) {
      const found = channelDepth(channel.children, targetId, depth + 1);
      if (found >= 0) return found;
    }
  }
  return -1;
}

export function DocumentMoveModal({
  documentName,
  currentChannelId,
  channels,
  onCancel,
  onSubmit,
}: DocumentMoveModalProps) {
  const flatChannels = useMemo(() => flattenChannels(channels), [channels]);
  const options = useMemo(
    () =>
      flatChannels
        .filter((channel) => channel.id !== currentChannelId)
        .map((channel) => ({
          id: channel.id,
          label: channelLabel(channel, channelDepth(channels, channel.id)),
        })),
    [channels, currentChannelId, flatChannels],
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
      setError(err instanceof Error ? err.message : 'Failed to move document');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>Move document</h2>
        <p className="admin-form-hint">
          Move <strong>{documentName}</strong> to another channel.
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
                  <option value="">No other channels available</option>
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
              {busy ? 'Moving…' : 'Move document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
