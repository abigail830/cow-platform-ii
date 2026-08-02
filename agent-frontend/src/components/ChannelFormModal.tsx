import { useState } from 'react';

type ChannelFormModalProps = {
  title: string;
  initialName?: string;
  initialDescription?: string;
  submitLabel: string;
  inheritHint?: string;
  onCancel: () => void;
  onSubmit: (input: { name: string; description: string }) => Promise<void>;
};

export function ChannelFormModal({
  title,
  initialName = '',
  initialDescription = '',
  submitLabel,
  inheritHint,
  onCancel,
  onSubmit,
}: ChannelFormModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), description: description.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save channel');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
            </label>
            <label className="form-field form-field-wide">
              <span>Description</span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          {inheritHint ? <p className="admin-form-hint form-field-wide">{inheritHint}</p> : null}
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
