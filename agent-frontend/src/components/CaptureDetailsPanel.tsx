import { Pencil, X, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AUDIENCE_LABELS,
  RECORDING_MODE_LABELS,
  type AudioCaptureDetail,
} from '../api/audioCaptures.ts';
import { iconProps } from './icons/icon-props.ts';

type CaptureDetailsPanelProps = {
  capture: AudioCaptureDetail;
  canEdit: boolean;
  onSave: (input: {
    brief: string | null;
    participantsHint: string | null;
    recordingMode: string | null;
    audience: string;
  }) => Promise<void>;
};

type FormState = {
  brief: string;
  participantsHint: string;
  recordingMode: string;
  audience: string;
};

function toFormState(capture: AudioCaptureDetail): FormState {
  return {
    brief: capture.brief ?? '',
    participantsHint: capture.participants_hint ?? '',
    recordingMode: capture.recording_mode ?? 'general',
    audience: capture.audience ?? 'unknown',
  };
}

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

export function CaptureDetailsPanel({ capture, canEdit, onSave }: CaptureDetailsPanelProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>(() => toFormState(capture));

  useEffect(() => {
    if (!editing) setForm(toFormState(capture));
  }, [capture, editing]);

  const modeLabel = capture.recording_mode
    ? RECORDING_MODE_LABELS[capture.recording_mode] ?? capture.recording_mode
    : '—';
  const audienceLabel = AUDIENCE_LABELS[capture.audience] ?? capture.audience;

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave({
        brief: form.brief.trim() || null,
        participantsHint: form.participantsHint.trim() || null,
        recordingMode: form.recordingMode || null,
        audience: form.audience,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save details');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="audio-detail-panel capture-detail-overview" aria-label="Capture details">
      <div className="document-detail-content-header">
        <h3 className="document-detail-panel-heading">Details</h3>
        {canEdit ? (
          <div className="document-detail-toolbar-actions">
            {editing ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setError('');
                    setForm(toFormState(capture));
                  }}
                >
                  <X {...iconProps()} aria-hidden />
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  <Check {...iconProps()} aria-hidden />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                <Pencil {...iconProps()} aria-hidden />
                Edit
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="capture-detail-overview-body">
        {error ? <p className="error inline">{error}</p> : null}

        {editing ? (
          <div className="capture-detail-edit-form">
            <label className="form-field form-field-wide">
              <span>Brief</span>
              <textarea
                value={form.brief}
                onChange={(event) => setForm((current) => ({ ...current, brief: event.target.value }))}
                rows={2}
                disabled={saving}
                placeholder="Optional context for classification and extraction"
              />
            </label>
            <div className="capture-detail-meta-grid capture-detail-meta-grid--details">
              <label className="form-field">
                <span>Mode</span>
                <select
                  value={form.recordingMode}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, recordingMode: event.target.value }))
                  }
                  disabled={saving}
                >
                  {Object.entries(RECORDING_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Audience</span>
                <select
                  value={form.audience}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, audience: event.target.value }))
                  }
                  disabled={saving}
                >
                  {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field capture-detail-participants-field">
                <span>Participants</span>
                <textarea
                  value={form.participantsHint}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, participantsHint: event.target.value }))
                  }
                  disabled={saving}
                  rows={2}
                  placeholder="Names or roles, comma-separated"
                />
              </label>
            </div>
          </div>
        ) : (
          <dl className="capture-detail-fields" aria-label="Capture metadata">
            <div className="capture-detail-field capture-detail-field--brief">
              <dt>Brief</dt>
              <dd>{displayValue(capture.brief)}</dd>
            </div>
            <div className="capture-detail-meta-grid capture-detail-meta-grid--details">
              <div className="capture-detail-meta-item">
                <dt>Mode</dt>
                <dd>{modeLabel}</dd>
              </div>
              <div className="capture-detail-meta-item">
                <dt>Audience</dt>
                <dd>{audienceLabel}</dd>
              </div>
              <div className="capture-detail-meta-item capture-detail-participants-field">
                <dt>Participants</dt>
                <dd>{displayValue(capture.participants_hint)}</dd>
              </div>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
