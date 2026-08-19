import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  createAsrHotword,
  deleteAsrHotword,
  listAsrHotwords,
  updateAsrHotword,
  type AsrHotword,
} from '../api/asrHotwords.ts';
import {
  listAudioChannels,
  type AudioChannel,
} from '../api/audioChannels.ts';
import {
  AudioChannelMultiSelect,
  audioChannelLabel,
} from '../components/AudioChannelMultiSelect.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { IconDelete, IconEdit } from '../components/AdminActionIcons.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/admin/asr-hotwords')!;

type FormState = {
  text: string;
  weight: string;
  lang: string;
  note: string;
  channelIds: string[];
};

function emptyForm(): FormState {
  return { text: '', weight: '3', lang: '', note: '', channelIds: [] };
}

function formFromHotword(hotword: AsrHotword): FormState {
  return {
    text: hotword.text,
    weight: String(hotword.weight),
    lang: hotword.lang ?? '',
    note: hotword.note ?? '',
    channelIds: [...hotword.channel_ids],
  };
}

export function AsrHotwordsPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(
    () => hasPermission(user, 'platform-basic:asr-hotwords', 'write'),
    [user],
  );

  const [hotwords, setHotwords] = useState<AsrHotword[]>([]);
  const [channels, setChannels] = useState<AudioChannel[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsrHotword | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [hotwordResult, channelRows] = await Promise.all([
        listAsrHotwords({ search }),
        listAudioChannels(),
      ]);
      setHotwords(hotwordResult.hotwords);
      setChannels(channelRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(hotword: AsrHotword) {
    setEditing(hotword);
    setForm(formFromHotword(hotword));
    setFormError('');
    setFormOpen(true);
  }

  async function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setFormBusy(true);
    const weight = Number(form.weight);
    try {
      const payload = {
        text: form.text.trim(),
        weight,
        lang: form.lang.trim() || null,
        note: form.note.trim() || null,
        channel_ids: form.channelIds,
      };
      if (editing) {
        await updateAsrHotword(editing.id, payload);
      } else {
        await createAsrHotword(payload);
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save hotword');
    } finally {
      setFormBusy(false);
    }
  }

  if (forbidden) return <Navigate to="/" replace />;

  return (
    <>
      <main className="admin-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Manage ASR hotwords and tag audio channels. Linked words are merged and synced to DashScope
            as a precompiled vocabulary when a channel transcription pipeline runs.
          </AdminPageDescription>
        </header>

        <div className="admin-toolbar">
          <div className="admin-toolbar-left">
            <div className="admin-search">
              <Search {...iconProps()} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search hotword text…"
              />
            </div>
          </div>
          {canWrite && (
            <button type="button" className="btn-primary" onClick={openCreate}>
              + Add hotword
            </button>
          )}
        </div>

        {error && <p className="error inline">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Text</th>
                <th>Weight</th>
                <th>Lang</th>
                <th>Channels</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">Loading…</td>
                </tr>
              ) : hotwords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">No hotwords found.</td>
                </tr>
              ) : (
                hotwords.map((hotword) => (
                  <tr key={hotword.id}>
                    <td>{hotword.text}</td>
                    <td>{hotword.weight}</td>
                    <td>{hotword.lang ?? '—'}</td>
                    <td>
                      <div className="capability-list">
                        {hotword.channel_ids.length > 0 ? (
                          hotword.channel_ids.map((channelId) => (
                            <span key={channelId} className="capability-pill">
                              {audioChannelLabel(channels, channelId)}
                            </span>
                          ))
                        ) : (
                          <span className="capability-pill muted">None</span>
                        )}
                      </div>
                    </td>
                    <td>{hotword.note ?? '—'}</td>
                    <td>
                      {canWrite && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit"
                            onClick={() => openEdit(hotword)}
                          >
                            <IconEdit />
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Delete"
                            onClick={() => {
                              if (!window.confirm(`Delete hotword "${hotword.text}"?`)) return;
                              void deleteAsrHotword(hotword.id).then(() => load());
                            }}
                          >
                            <IconDelete />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {formOpen && (
        <div className="modal-backdrop" onClick={() => !formBusy && setFormOpen(false)}>
          <div
            className="modal-card model-config-form asr-hotword-form-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{editing ? 'Edit hotword' : 'Add hotword'}</h2>
            <form className="asr-hotword-form" onSubmit={(event) => void handleFormSubmit(event)}>
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
                <label className="form-field form-field-wide">
                  <span>Note</span>
                  <textarea
                    rows={2}
                    value={form.note}
                    onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                <div className="form-field form-field-wide">
                  <span>Audio channels</span>
                  <AudioChannelMultiSelect
                    channels={channels}
                    selectedIds={form.channelIds}
                    onChange={(channelIds) => setForm((prev) => ({ ...prev, channelIds }))}
                    disabled={formBusy}
                    embedded
                  />
                </div>
                </div>
              </div>
              {formError && <p className="error">{formError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setFormOpen(false)}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={formBusy}>
                  {formBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
