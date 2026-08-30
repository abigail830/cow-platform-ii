import { useCallback, useEffect, useState } from 'react';
import { Highlighter, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  getEvalRunHotwords,
  updateEvalRunHotwords,
  type EvalRun,
  type EvalRunAsrHotword,
} from '../api/evaluation/runs.ts';
import { iconProps } from './icons/icon-props.ts';

type HotwordDraft = {
  text: string;
  weight: string;
  lang: string;
};

type EvalRunHotwordsDrawerProps = {
  run: EvalRun | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function emptyDraft(): HotwordDraft {
  return { text: '', weight: '3', lang: '' };
}

function draftFromHotword(hotword: EvalRunAsrHotword): HotwordDraft {
  return {
    text: hotword.text,
    weight: String(hotword.weight),
    lang: hotword.lang ?? '',
  };
}

function draftToHotword(draft: HotwordDraft): EvalRunAsrHotword {
  return {
    text: draft.text.trim(),
    weight: Number(draft.weight),
    lang: draft.lang.trim() || null,
  };
}

export function EvalRunHotwordsDrawer({
  run,
  canWrite,
  onClose,
  onSaved,
}: EvalRunHotwordsDrawerProps) {
  const [hotwords, setHotwords] = useState<EvalRunAsrHotword[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<HotwordDraft>(emptyDraft());
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    if (!run) return;
    setLoading(true);
    setError('');
    try {
      const rows = await getEvalRunHotwords(run.id);
      setHotwords(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hotwords');
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    if (!run) {
      setHotwords([]);
      setFormOpen(false);
      setEditingIndex(null);
      setForm(emptyDraft());
      setError('');
      return;
    }
    void load();
  }, [run, load]);

  function openCreate() {
    setEditingIndex(null);
    setForm(emptyDraft());
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(index: number) {
    setEditingIndex(index);
    setForm(draftFromHotword(hotwords[index]!));
    setFormError('');
    setFormOpen(true);
  }

  function applyFormDraft() {
    const weight = Number(form.weight);
    if (!form.text.trim()) {
      setFormError('Text is required');
      return;
    }
    if (!Number.isFinite(weight)) {
      setFormError('Weight must be a number');
      return;
    }
    const next = draftToHotword(form);
    if (editingIndex != null) {
      setHotwords((prev) => prev.map((row, index) => (index === editingIndex ? next : row)));
    } else {
      setHotwords((prev) => [...prev, next]);
    }
    setFormOpen(false);
    setEditingIndex(null);
    setForm(emptyDraft());
    setFormError('');
  }

  async function handleSave() {
    if (!run) return;
    setSaving(true);
    setError('');
    try {
      const saved = await updateEvalRunHotwords(
        run.id,
        hotwords.map((row) => ({
          text: row.text,
          weight: row.weight,
          lang: row.lang,
        })),
      );
      setHotwords(saved);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hotwords');
    } finally {
      setSaving(false);
    }
  }

  if (!run) return null;

  return (
    <div className="admin-drawer-backdrop" onClick={onClose}>
      <aside className="admin-drawer" onClick={(event) => event.stopPropagation()}>
        <header className="admin-drawer-header">
          <div>
            <h2 className="admin-drawer-title">
              <Highlighter {...iconProps()} aria-hidden />
              ASR hotwords
            </h2>
            <p className="admin-drawer-subtitle">{run.name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close hotwords">
            <X {...iconProps()} />
          </button>
        </header>

        <div className="admin-drawer-body">
          <p className="admin-muted eval-run-hotwords-note">
            One hotword list applies to every pipeline in this run. Changes take effect on the next
            attempt only — running and past attempts keep their snapshot.
          </p>

          {error ? <p className="admin-error">{error}</p> : null}

          {canWrite ? (
            <div className="admin-toolbar eval-run-hotwords-toolbar">
              <div className="admin-toolbar-left" />
              <button type="button" className="btn-secondary" onClick={openCreate}>
                <Plus {...iconProps()} aria-hidden />
                Add hotword
              </button>
            </div>
          ) : null}

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Text</th>
                  <th>Weight</th>
                  <th>Lang</th>
                  {canWrite ? <th aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={canWrite ? 4 : 3} className="admin-table-empty">
                      Loading…
                    </td>
                  </tr>
                ) : hotwords.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 4 : 3} className="admin-table-empty">
                      No hotwords configured.
                    </td>
                  </tr>
                ) : (
                  hotwords.map((hotword, index) => (
                    <tr key={`${hotword.text}-${index}`}>
                      <td>{hotword.text}</td>
                      <td>{hotword.weight}</td>
                      <td>{hotword.lang ?? '—'}</td>
                      {canWrite ? (
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title="Edit"
                              onClick={() => openEdit(index)}
                            >
                              <Pencil {...iconProps()} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Delete"
                              onClick={() =>
                                setHotwords((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
                              }
                            >
                              <Trash2 {...iconProps()} aria-hidden />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {canWrite ? (
          <footer className="admin-drawer-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save hotwords'}
            </button>
          </footer>
        ) : null}
      </aside>

      {formOpen ? (
        <div className="modal-backdrop" onClick={() => setFormOpen(false)}>
          <div
            className="modal-card model-config-form asr-hotword-form-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{editingIndex != null ? 'Edit hotword' : 'Add hotword'}</h2>
            <form
              className="asr-hotword-form"
              onSubmit={(event) => {
                event.preventDefault();
                applyFormDraft();
              }}
            >
              <div className="asr-hotword-form-body">
                <div className="form-grid">
                  <label className="form-field">
                    <span>Text</span>
                    <input
                      value={form.text}
                      onChange={(event) => setForm((prev) => ({ ...prev, text: event.target.value }))}
                      required
                      autoFocus
                    />
                  </label>
                  <label className="form-field">
                    <span>Weight (1–5, or 50 for Qwen super)</span>
                    <input
                      type="number"
                      value={form.weight}
                      onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Language hint</span>
                    <input
                      value={form.lang}
                      onChange={(event) => setForm((prev) => ({ ...prev, lang: event.target.value }))}
                      placeholder="Optional, e.g. zh"
                    />
                  </label>
                </div>
                {formError ? <p className="admin-error">{formError}</p> : null}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingIndex != null ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
