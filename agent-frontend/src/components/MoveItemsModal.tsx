import { useState } from 'react';

type MoveItemsModalProps = {
  count: number;
  onCancel: () => void;
  onSubmit: (destinationPrefix: string) => Promise<void>;
};

export function MoveItemsModal({ count, onCancel, onSubmit }: MoveItemsModalProps) {
  const [destinationPrefix, setDestinationPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(destinationPrefix);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move items');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>Move selected</h2>
        <p className="admin-form-hint">
          Move {count} item{count === 1 ? '' : 's'} to the destination prefix (folder path ending with /).
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>Destination prefix</span>
              <input
                value={destinationPrefix}
                onChange={(event) => setDestinationPrefix(event.target.value)}
                placeholder="documents/"
                required
                autoFocus
              />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Moving…' : 'Move items'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
