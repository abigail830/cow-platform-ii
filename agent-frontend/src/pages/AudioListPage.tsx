import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flattenAudioChannels } from '../api/audioChannels.ts';
import {
  deleteAudio,
  formatAudioBytes,
  listAudios,
  runAudioPipeline,
  uploadAudio,
  type AudioRecord,
} from '../api/audios.ts';
import { IconDelete, IconRun } from '../components/AdminActionIcons.tsx';
import { formatDocumentStatusLabel } from '../components/DocumentPipelineStatus.tsx';
import { AudioUploadModal } from '../components/AudioUploadModal.tsx';
import { Loader2, Search } from 'lucide-react';
import { iconProps } from '../components/icons/icon-props.ts';
import { useAudioOutletContext } from './AudioOutletContext.tsx';

function formatAudioStage(stage: string | undefined): string {
  switch (stage) {
    case 'submitted':
      return 'Submitting';
    case 'transcribing':
      return 'Transcribing';
    case 'done':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return stage ?? '—';
  }
}

export function AudioListPage() {
  const { channels, selectedChannelId, loadingChannels, canWrite } = useAudioOutletContext();

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
    const hasRunning = items.some((item) => item.status === 'running');
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
    try {
      await runAudioPipeline(audio.id);
      await loadAudios();
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
    <div className="documents-list-panel">
      <div className="documents-toolbar">
        <div className="documents-toolbar-search">
          <Search {...iconProps()} aria-hidden />
          <input
            type="search"
            placeholder="Search audio files"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={!selectedChannelId}
          />
        </div>
        {canWrite && canWriteChannel && selectedChannelId && (
          <button type="button" className="btn-primary" onClick={() => setUploadOpen(true)}>
            Upload audio
          </button>
        )}
      </div>

      {error && <p className="admin-error">{error}</p>}

      {loadingChannels || loading ? (
        <p className="admin-muted documents-loading">
          <Loader2 {...iconProps()} className="spin" aria-hidden /> Loading…
        </p>
      ) : !selectedChannelId ? (
        <p className="admin-table-empty">Select or create a channel to view audio files.</p>
      ) : items.length === 0 ? (
        <p className="admin-table-empty">No audio files in this channel yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Status</th>
                <th>Pipeline</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((audio) => (
                <tr key={audio.id}>
                  <td>
                    <Link to={`/knowledge/audio/${audio.id}`} className="documents-name-link">
                      {audio.name}
                    </Link>
                  </td>
                  <td>{formatAudioBytes(audio.size_bytes)}</td>
                  <td>{formatDocumentStatusLabel(audio.status)}</td>
                  <td>{formatAudioStage(audio.pipeline_job?.stage)}</td>
                  <td>{new Date(audio.updated_at).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      {canWriteChannel && channelHasPipeline && (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Run transcription pipeline"
                          disabled={audio.status === 'running' || runningIds.has(audio.id)}
                          onClick={() => void handleRunPipeline(audio)}
                        >
                          <IconRun />
                        </button>
                      )}
                      {canWriteChannel && (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Delete"
                          disabled={deletingIds.has(audio.id)}
                          onClick={() => void handleDelete(audio)}
                        >
                          <IconDelete />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="admin-muted documents-list-footer">{total} file(s)</p>
        </div>
      )}

      {uploadOpen && selectedChannel && (
        <AudioUploadModal
          channelName={selectedChannel.name}
          onCancel={() => setUploadOpen(false)}
          onUpload={handleUpload}
        />
      )}
    </div>
  );
}
