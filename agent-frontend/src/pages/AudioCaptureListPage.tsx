import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flattenAudioChannels } from '../api/audioChannels.ts';
import {
  CAPTURE_INPUT_MODE_LABELS,
  createAudioCapture,
  deleteAudioCapture,
  isCapturePipelineActive,
  listAudioCaptures,
  RECORDING_MODE_LABELS,
  uploadCaptureSegment,
  uploadCaptureTranscriptSegment,
  type AudioCaptureRecord,
} from '../api/audioCaptures.ts';
import { IconDelete, IconView } from '../components/AdminActionIcons.tsx';
import { AudioCaptureCreateModal } from '../components/AudioCaptureCreateModal.tsx';
import { CapturePipelineStatus } from '../components/CapturePipelineStatus.tsx';
import { Loader2, Search } from 'lucide-react';
import { iconProps } from '../components/icons/icon-props.ts';
import { useAudioOutletContext } from './AudioOutletContext.tsx';

export function AudioCaptureListPage() {
  const { channels, selectedChannelId, loadingChannels, canWrite } = useAudioOutletContext();

  const [items, setItems] = useState<AudioCaptureRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const flatChannels = useMemo(() => flattenAudioChannels(channels), [channels]);
  const selectedChannel = flatChannels.find((channel) => channel.id === selectedChannelId) ?? null;
  const canWriteChannel = canWrite && Boolean(selectedChannel?.my_access?.write);

  const loadCaptures = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedChannelId) {
      setItems([]);
      setTotal(0);
      return;
    }
    if (!options?.silent) setLoading(true);
    setError('');
    try {
      const result = await listAudioCaptures({ channelId: selectedChannelId, search });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load captures');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [search, selectedChannelId]);

  useEffect(() => {
    void loadCaptures();
  }, [loadCaptures]);

  useEffect(() => {
    const hasRunning = items.some((item) => isCapturePipelineActive(item));
    if (!hasRunning || !selectedChannelId) return;
    const intervalId = window.setInterval(() => void loadCaptures({ silent: true }), 5000);
    return () => window.clearInterval(intervalId);
  }, [items, loadCaptures, selectedChannelId]);

  async function handleCreate(input: {
    title: string;
    brief?: string;
    participantsHint?: string;
    recordingMode?: string;
    audience?: string;
    inputMode: 'audio' | 'transcript';
    files: File[];
  }) {
    if (!selectedChannelId) throw new Error('Select a channel first');
    const capture = await createAudioCapture({
      channelId: selectedChannelId,
      title: input.title,
      brief: input.brief,
      participantsHint: input.participantsHint,
      recordingMode: input.recordingMode,
      audience: input.audience,
      inputMode: input.inputMode,
    });
    const uploadSegment =
      input.inputMode === 'transcript' ? uploadCaptureTranscriptSegment : uploadCaptureSegment;
    for (const file of input.files) {
      await uploadSegment(capture.id, file);
    }
    setCreateOpen(false);
    await loadCaptures();
  }

  async function handleDelete(capture: AudioCaptureRecord) {
    if (!window.confirm(`Delete capture "${capture.title}"?`)) return;
    setDeletingIds((current) => new Set(current).add(capture.id));
    setError('');
    try {
      await deleteAudioCapture(capture.id);
      await loadCaptures();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete capture');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(capture.id);
        return next;
      });
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search">
            <Search {...iconProps()} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search captures…"
              disabled={!selectedChannelId}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadCaptures()}
            disabled={!selectedChannelId || loading}
          >
            Refresh
          </button>
        </div>
        {canWriteChannel && (
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedChannelId}
            onClick={() => setCreateOpen(true)}
          >
            + New capture
          </button>
        )}
      </div>

      {selectedChannel && (
        <p className="documents-channel-context">
          Channel: <strong>{selectedChannel.name}</strong>
          {selectedChannel.description ? ` — ${selectedChannel.description}` : ''}
        </p>
      )}

      {error && <p className="error inline">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Input</th>
              <th>Recording mode</th>
              <th>Segments</th>
              <th className="documents-status-col">Status</th>
              <th>Updated</th>
              <th className="admin-table-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!selectedChannelId ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  Select or create a channel to manage audio captures.
                </td>
              </tr>
            ) : loadingChannels || loading ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  <Loader2 {...iconProps({ className: 'document-detail-loading-icon' })} aria-hidden />
                  {' '}Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  No captures in this channel yet.
                </td>
              </tr>
            ) : (
              items.map((capture) => {
                const isDeleting = deletingIds.has(capture.id);
                const inputLabel =
                  CAPTURE_INPUT_MODE_LABELS[capture.input_mode ?? 'audio'] ?? capture.input_mode;
                const modeLabel = capture.recording_mode
                  ? RECORDING_MODE_LABELS[capture.recording_mode] ?? capture.recording_mode
                  : '—';

                return (
                  <tr key={capture.id}>
                    <td>
                      <Link
                        to={`/knowledge/audio/captures/${capture.id}`}
                        className="document-name-link document-name-link--table"
                      >
                        {capture.title}
                      </Link>
                      {capture.brief ? (
                        <div className="documents-table-meta">{capture.brief}</div>
                      ) : null}
                    </td>
                    <td className="documents-table-meta">{inputLabel}</td>
                    <td className="documents-table-meta">{modeLabel}</td>
                    <td className="documents-table-meta">{capture.segment_count}</td>
                    <td className="documents-status-col">
                      <CapturePipelineStatus capture={capture} />
                    </td>
                    <td className="documents-table-meta">
                      {new Date(capture.updated_at).toLocaleString()}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          to={`/knowledge/audio/captures/${capture.id}`}
                          className="icon-btn"
                          title="View capture"
                          aria-label={`View ${capture.title}`}
                        >
                          <IconView />
                        </Link>
                        {canWriteChannel && (
                          <button
                            type="button"
                            className={`icon-btn danger icon-btn--delete${isDeleting ? ' is-busy' : ''}`}
                            title={isDeleting ? 'Deleting…' : 'Delete'}
                            disabled={isDeleting}
                            aria-busy={isDeleting}
                            onClick={() => void handleDelete(capture)}
                          >
                            {isDeleting ? (
                              <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                            ) : (
                              <IconDelete />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedChannelId && total > items.length && (
        <p className="documents-list-meta">
          Showing {items.length} of {total} captures
        </p>
      )}

      {createOpen && selectedChannel && (
        <AudioCaptureCreateModal
          channelName={selectedChannel.name}
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}
