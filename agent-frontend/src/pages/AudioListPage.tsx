import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flattenAudioChannels } from '../api/audioChannels.ts';
import {
  deleteAudio,
  formatAudioBytes,
  isAudioPipelineActive,
  isAudioPipelineBusy,
  listAudios,
  runAudioPipeline,
  uploadAudio,
  type AudioRecord,
} from '../api/audios.ts';
import { IconDelete, IconRun } from '../components/AdminActionIcons.tsx';
import { AudioPipelineStatus } from '../components/AudioPipelineStatus.tsx';
import { AudioUploadModal } from '../components/AudioUploadModal.tsx';
import { Loader2, Search } from 'lucide-react';
import { iconProps } from '../components/icons/icon-props.ts';
import { useAudioOutletContext } from './AudioOutletContext.tsx';

export function AudioListPage() {
  const { channels, selectedChannelId, loadingChannels } = useAudioOutletContext();

  const [items, setItems] = useState<AudioRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const flatChannels = useMemo(() => flattenAudioChannels(channels), [channels]);
  const selectedChannel = flatChannels.find((channel) => channel.id === selectedChannelId) ?? null;
  const canWriteChannel = Boolean(selectedChannel?.my_access?.write);
  const channelHasPipeline = Boolean(selectedChannel?.pipeline_id);

  const loadAudios = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedChannelId) {
      setItems([]);
      setTotal(0);
      return;
    }
    if (!options?.silent) setLoading(true);
    setError('');
    try {
      const result = await listAudios({ channelId: selectedChannelId, search });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audio files');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [search, selectedChannelId]);

  useEffect(() => {
    void loadAudios();
  }, [loadAudios]);

  useEffect(() => {
    const hasRunning = items.some((item) => isAudioPipelineActive(item));
    if (!hasRunning || !selectedChannelId) return;
    const intervalId = window.setInterval(() => void loadAudios({ silent: true }), 5000);
    return () => window.clearInterval(intervalId);
  }, [items, loadAudios, selectedChannelId]);

  async function handleUpload(files: File[]) {
    if (!selectedChannelId) throw new Error('Select a channel first');
    for (const file of files) {
      await uploadAudio(selectedChannelId, file);
    }
    setUploadOpen(false);
    await loadAudios();
  }

  async function handleDelete(audio: AudioRecord) {
    if (!window.confirm(`Delete "${audio.name}"?`)) return;
    setDeletingIds((current) => new Set(current).add(audio.id));
    setError('');
    try {
      await deleteAudio(audio.id);
      await loadAudios();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete audio');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(audio.id);
        return next;
      });
    }
  }

  async function handleRunPipeline(audio: AudioRecord) {
    if (!channelHasPipeline) return;
    setRunningIds((current) => new Set(current).add(audio.id));
    setError('');
    try {
      await runAudioPipeline(audio.id);
      await loadAudios({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pipeline');
    } finally {
      setRunningIds((current) => {
        const next = new Set(current);
        next.delete(audio.id);
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
              placeholder="Search audio files…"
              disabled={!selectedChannelId}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadAudios()}
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
            onClick={() => setUploadOpen(true)}
          >
            + Upload
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
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th className="documents-status-col">Status</th>
              <th>Uploaded</th>
              <th className="admin-table-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!selectedChannelId ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  Select or create a channel to manage audio files.
                </td>
              </tr>
            ) : loadingChannels || loading ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  No audio files in this channel yet.
                </td>
              </tr>
            ) : (
              items.map((audio) => {
                const isPipelineBusy = isAudioPipelineBusy(audio, runningIds);
                const isDeleting = deletingIds.has(audio.id);

                return (
                  <tr key={audio.id}>
                    <td>
                      <Link to={`/knowledge/audio/${audio.id}`} className="document-name-link">
                        {audio.name}
                      </Link>
                    </td>
                    <td className="documents-table-meta">{audio.file_type}</td>
                    <td className="documents-table-meta">{formatAudioBytes(audio.size_bytes)}</td>
                    <td className="documents-status-col">
                      <AudioPipelineStatus audio={audio} />
                    </td>
                    <td className="documents-table-meta">
                      {new Date(audio.created_at).toLocaleString()}
                    </td>
                    <td>
                      <div className="row-actions">
                        {canWriteChannel && channelHasPipeline && (
                          <button
                            type="button"
                            className={`icon-btn icon-btn--run${isPipelineBusy ? ' is-busy' : ''}`}
                            title={
                              isPipelineBusy
                                ? 'Transcription running…'
                                : 'Run transcription pipeline'
                            }
                            disabled={isPipelineBusy}
                            aria-busy={isPipelineBusy}
                            onClick={() => void handleRunPipeline(audio)}
                          >
                            {isPipelineBusy ? (
                              <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                            ) : (
                              <IconRun />
                            )}
                          </button>
                        )}
                        {canWriteChannel && (
                          <button
                            type="button"
                            className={`icon-btn danger icon-btn--delete${isDeleting ? ' is-busy' : ''}`}
                            title={isDeleting ? 'Deleting…' : 'Delete'}
                            disabled={isDeleting}
                            aria-busy={isDeleting}
                            onClick={() => void handleDelete(audio)}
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
          Showing {items.length} of {total} audio files
        </p>
      )}

      {uploadOpen && selectedChannel && (
        <AudioUploadModal
          channelName={selectedChannel.name}
          onCancel={() => setUploadOpen(false)}
          onUpload={handleUpload}
        />
      )}
    </>
  );
}
