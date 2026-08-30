import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Highlighter, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  getEvalRunHotwords,
  updateEvalRunHotwords,
  type EvalRun,
  type EvalRunAsrHotword,
} from '../api/evaluation/runs.ts';
import { downloadTextFile, sanitizeDownloadFilename, withDownloadExtension } from '../shared/download-text.ts';
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

function parseImportedHotwords(raw: unknown): EvalRunAsrHotword[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { hotwords?: unknown }).hotwords)
      ? (raw as { hotwords: unknown[] }).hotwords
      : null;
  if (!list) {
    throw new Error('Expected a JSON array of hotwords or { "hotwords": [...] }');
  }

  return list.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`hotwords[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) throw new Error(`hotwords[${index}].text is required`);
    const weight = Number(row.weight);
    if (!Number.isFinite(weight)) {
      throw new Error(`hotwords[${index}].weight must be a number`);
    }
    const lang =
      row.lang == null || row.lang === ''
        ? null
        : String(row.lang).trim() || null;
    return { text, weight, lang };
  });
}

function hotwordsExportFilename(runName: string): string {
  return withDownloadExtension(`${sanitizeDownloadFilename(runName)}-asr-hotwords`, 'json');
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
  const [importNotice, setImportNotice] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

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
      setImportNotice('');
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
    setImportNotice('');
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

  function handleExport() {
    if (!run) return;
    const payload = hotwords.map((row) => ({
      text: row.text,
      weight: row.weight,
      lang: row.lang,
    }));
    downloadTextFile(
      `${JSON.stringify(payload, null, 2)}\n`,
      hotwordsExportFilename(run.name),
      'application/json;charset=utf-8',
    );
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    setImportNotice('');
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const imported = parseImportedHotwords(raw);
      setHotwords(imported);
      setImportNotice(
        imported.length === 0
          ? 'Imported an empty list. Click Save hotwords to apply.'
          : `Imported ${imported.length} hotword${imported.length === 1 ? '' : 's'}. Click Save hotwords to apply.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import hotwords');
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
          {importNotice ? <p className="admin-muted">{importNotice}</p> : null}

          <div className="admin-toolbar eval-run-hotwords-toolbar">
            <div className="admin-toolbar-left">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleExport}
                disabled={loading}
              >
                <Download {...iconProps()} aria-hidden />
                Export
              </button>
              {canWrite ? (
                <button type="button" className="btn-secondary" onClick={handleImportClick}>
                  <Upload {...iconProps()} aria-hidden />
                  Import
                </button>
              ) : null}
            </div>
            {canWrite ? (
              <button type="button" className="btn-secondary" onClick={openCreate}>
                <Plus {...iconProps()} aria-hidden />
                Add hotword
              </button>
            ) : null}
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => void handleImportFile(event)}
          />

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
