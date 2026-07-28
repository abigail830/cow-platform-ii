import { useEffect, useState } from 'react';
import type { PermissionInput, PermissionRecord } from '../api/permissions.ts';

const CATEGORIES = ['platform-basic', 'admin', 'agent'] as const;

type PermissionFormProps = {
  initial?: PermissionRecord | null;
  onSubmit: (input: PermissionInput) => Promise<void>;
  onCancel: () => void;
  readOnly?: boolean;
};

function linesToPatterns(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function patternsToLines(patterns: string[]): string {
  return patterns.join('\n');
}

export function PermissionForm({ initial, onSubmit, onCancel, readOnly }: PermissionFormProps) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'admin');
  const [routePatterns, setRoutePatterns] = useState(patternsToLines(initial?.routePatterns ?? []));
  const [apiPatterns, setApiPatterns] = useState(patternsToLines(initial?.apiPatterns ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setKey(initial?.key ?? '');
    setLabel(initial?.label ?? '');
    setDescription(initial?.description ?? '');
    setCategory(initial?.category ?? 'admin');
    setRoutePatterns(patternsToLines(initial?.routePatterns ?? []));
    setApiPatterns(patternsToLines(initial?.apiPatterns ?? []));
    setError('');
  }, [initial]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        key: key.trim(),
        label: label.trim(),
        description: description.trim() || null,
        category,
        routePatterns: linesToPatterns(routePatterns),
        apiPatterns: linesToPatterns(apiPatterns),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>{initial ? (readOnly ? 'View permission' : 'Edit permission') : 'Add permission'}</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field">
              <span>Key</span>
              <input
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="e.g. platform-basic:models:read"
                required
                disabled={Boolean(initial) || readOnly}
              />
            </label>
            <label className="form-field">
              <span>Label</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Short display name"
                required
                disabled={readOnly}
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Description (optional)</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this permission covers"
                rows={2}
                disabled={readOnly}
              />
            </label>
            <label className="form-field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={readOnly}>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field form-field-wide">
              <span>Frontend route patterns (one per line)</span>
              <textarea
                value={routePatterns}
                onChange={(event) => setRoutePatterns(event.target.value)}
                placeholder={'/admin/users\n/admin/*'}
                rows={3}
                disabled={readOnly}
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Backend API patterns (one per line)</span>
              <textarea
                value={apiPatterns}
                onChange={(event) => setApiPatterns(event.target.value)}
                placeholder={'/api/admin/users\n/api/admin/users/*'}
                rows={3}
                disabled={readOnly}
              />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Saving…' : initial ? 'Save' : 'Create permission'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
