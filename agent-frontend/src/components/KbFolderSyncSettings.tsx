import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { listDocumentChannels, type DocumentChannel } from '../api/documentChannels.ts';
import {
  getKbFolderSync,
  retryKbFolderSync,
  syncKbFolderNow,
  updateKbFolderSync,
  type KbFolderSyncConfig,
  type KbImportJob,
} from '../api/knowledgeBases.ts';
import { FolderChannelPicker } from './FolderChannelPicker.tsx';
import { iconProps } from './icons/icon-props.ts';

type KbFolderSyncSettingsProps = {
  knowledgeBaseId: string;
  canWrite: boolean;
  importJobActive: boolean;
  onCancel: () => void;
  onSyncStarted?: (jobId: string) => void;
  onImportJobUpdate?: (job: KbImportJob | null) => void;
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

export function KbFolderSyncSettings({
  knowledgeBaseId,
  canWrite,
  importJobActive,
  onCancel,
  onSyncStarted,
}: KbFolderSyncSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [config, setConfig] = useState<KbFolderSyncConfig | null>(null);
  const [channels, setChannels] = useState<DocumentChannel[]>([]);

  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(10);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [channelIds, setChannelIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [syncConfig, channelTree] = await Promise.all([
        getKbFolderSync(knowledgeBaseId),
        listDocumentChannels(),
      ]);
      setConfig(syncConfig);
      setChannels(channelTree);
      setAutoSyncEnabled(syncConfig.auto_sync_enabled);
      setSyncIntervalMinutes(syncConfig.sync_interval_minutes);
      setIncludeSubfolders(syncConfig.include_subfolders);
      setChannelIds(syncConfig.channel_ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folder sync settings');
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError('');
    setStatusMessage('');
    try {
      await updateKbFolderSync(knowledgeBaseId, {
        auto_sync_enabled: autoSyncEnabled,
        sync_interval_minutes: syncIntervalMinutes,
        include_subfolders: includeSubfolders,
        channel_ids: channelIds,
      });
      await load();
      setStatusMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow() {
    if (!canWrite) return;
    setSyncing(true);
    setError('');
    setStatusMessage('');
    try {
      const result = await syncKbFolderNow(knowledgeBaseId);
      if (result.status === 'dispatched' && result.job_id) {
        onSyncStarted?.(result.job_id);
        setStatusMessage(`Sync started (${result.batch_size ?? 0} document(s)).`);
      } else if (result.status === 'skipped' && result.reason === 'import_in_progress') {
        setStatusMessage('An import is already in progress.');
      } else if (result.status === 'idle') {
        setStatusMessage(
          result.reason === 'nothing_to_sync' ? 'Everything is up to date.' : 'No folders bound yet.',
        );
      } else {
        setStatusMessage(`Sync: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleRetryFailed() {
    if (!canWrite) return;
    setRetrying(true);
    setError('');
    setStatusMessage('');
    try {
      const failedIds = config?.stats.failed_documents.map((d) => d.document_id) ?? [];
      const result = await retryKbFolderSync(
        knowledgeBaseId,
        failedIds.length > 0 ? failedIds : undefined,
      );
      if (result.status === 'dispatched' && result.job_id) {
        onSyncStarted?.(result.job_id);
        setStatusMessage(`Retry started (${result.batch_size ?? 0} document(s)).`);
      } else {
        setStatusMessage(`Retry: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  }

  const stats = config?.stats;
  const syncBusy = syncing || retrying || importJobActive || stats?.import_in_progress;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card model-config-form kb-folder-sync-modal"
        role="dialog"
        aria-labelledby="kb-folder-sync-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kb-folder-sync-title">Folder sync</h2>
        <p className="admin-form-hint kb-folder-sync-intro">
          Bind document folders so completed files are imported automatically on a schedule, or use
          Sync now for an immediate batch.
        </p>

        {error && <p className="admin-error" role="alert">{error}</p>}
        {statusMessage && <p className="admin-success" role="status">{statusMessage}</p>}

        {loading ? (
          <p className="panel-loading" role="status">
            <Loader2 {...iconProps({ size: 18, className: 'panel-loading-icon' })} aria-hidden />
            Loading folder sync…
          </p>
        ) : (
          <form className="form-grid" onSubmit={(e) => void handleSave(e)}>
            <label className="form-field form-field-wide kb-folder-sync-toggle">
              <span>Auto sync</span>
              <input
                type="checkbox"
                className="brand-checkbox"
                checked={autoSyncEnabled}
                disabled={!canWrite}
                onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              />
              <span className="admin-form-hint">
                When enabled, bound folders are scanned every {syncIntervalMinutes} minutes.
              </span>
            </label>

            <label className="form-field">
              <span>Interval (minutes)</span>
              <input
                type="number"
                min={5}
                max={1440}
                value={syncIntervalMinutes}
                disabled={!canWrite}
                onChange={(e) => setSyncIntervalMinutes(Number(e.target.value))}
              />
            </label>

            <label className="form-field kb-folder-sync-toggle">
              <span>Include subfolders</span>
              <input
                type="checkbox"
                className="brand-checkbox"
                checked={includeSubfolders}
                disabled={!canWrite}
                onChange={(e) => setIncludeSubfolders(e.target.checked)}
              />
            </label>

            <div className="form-field form-field-wide">
              <span>Bound folders</span>
              <FolderChannelPicker
                channels={channels}
                selectedIds={channelIds}
                onChange={setChannelIds}
                disabled={!canWrite}
              />
            </div>

            {stats && (
              <div className="form-field form-field-wide kb-folder-sync-stats">
                <span>Status</span>
                <ul>
                  <li>Unsynced: {stats.unsynced_count}</li>
                  <li>Failed: {stats.failed_count}</li>
                  <li>
                    Import:{' '}
                    {stats.import_in_progress || importJobActive ? 'In progress' : 'Idle'}
                  </li>
                  <li>Last auto sync: {formatRelativeTime(config?.last_auto_sync_at ?? null)}</li>
                </ul>
                {stats.failed_documents.length > 0 && (
                  <details className="kb-folder-sync-failed-list">
                    <summary>Failed documents</summary>
                    <ul>
                      {stats.failed_documents.map((doc) => (
                        <li key={doc.document_id} title={doc.error_message ?? undefined}>
                          {doc.document_name}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="modal-actions form-field-wide kb-folder-sync-actions">
              {canWrite && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={syncBusy}
                    onClick={() => void handleSyncNow()}
                  >
                    {syncing ? (
                      <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
                    ) : (
                      <RefreshCw {...iconProps({ size: 16 })} aria-hidden />
                    )}
                    Sync now
                  </button>
                  {(stats?.failed_count ?? 0) > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={syncBusy}
                      onClick={() => void handleRetryFailed()}
                    >
                      {retrying ? (
                        <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
                      ) : (
                        <RefreshCw {...iconProps({ size: 16 })} aria-hidden />
                      )}
                      Retry failed ({stats?.failed_count ?? 0})
                    </button>
                  )}
                </>
              )}
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Close
              </button>
              {canWrite && (
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
