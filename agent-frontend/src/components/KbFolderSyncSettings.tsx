import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { listDocumentChannels, type DocumentChannel } from '../api/documentChannels.ts';
import {
  getKbFolderSync,
  listKbFolderSyncJobs,
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

type FolderSyncTab = 'settings' | 'history';

function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

function jobStatusClass(status: string): string {
  if (status === 'completed') return 'kb-status-completed';
  if (status === 'failed') return 'kb-status-failed';
  return 'kb-status-pending';
}

export function KbFolderSyncSettings({
  knowledgeBaseId,
  canWrite,
  importJobActive,
  onCancel,
  onSyncStarted,
}: KbFolderSyncSettingsProps) {
  const [tab, setTab] = useState<FolderSyncTab>('settings');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [config, setConfig] = useState<KbFolderSyncConfig | null>(null);
  const [channels, setChannels] = useState<DocumentChannel[]>([]);
  const [historyJobs, setHistoryJobs] = useState<KbImportJob[]>([]);

  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(10);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [channelIds, setChannelIds] = useState<string[]>([]);

  const loadConfig = useCallback(async () => {
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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await listKbFolderSyncJobs(knowledgeBaseId, 30);
      setHistoryJobs(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync history');
    } finally {
      setHistoryLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (tab === 'history') {
      void loadHistory();
    }
  }, [tab, loadHistory]);

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
      await loadConfig();
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
        if (tab === 'history') void loadHistory();
      } else if (result.status === 'skipped' && result.reason === 'import_in_progress') {
        setStatusMessage('An import is already in progress.');
      } else if (result.status === 'idle') {
        setStatusMessage(
          result.reason === 'nothing_to_sync' ? 'Everything is up to date.' : 'No folders bound yet.',
        );
      } else {
        setStatusMessage(`Sync: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
      }
      await loadConfig();
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
        if (tab === 'history') void loadHistory();
      } else {
        setStatusMessage(`Retry: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
      }
      await loadConfig();
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

        <div className="modal-tabs" role="tablist" aria-label="Folder sync">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'settings'}
            className={`modal-tab${tab === 'settings' ? ' active' : ''}`}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={`modal-tab${tab === 'history' ? ' active' : ''}`}
            onClick={() => setTab('history')}
          >
            Sync history
          </button>
        </div>

        {error && <p className="admin-error" role="alert">{error}</p>}
        {statusMessage && <p className="admin-success" role="status">{statusMessage}</p>}

        {loading && tab === 'settings' ? (
          <p className="panel-loading" role="status">
            <Loader2 {...iconProps({ size: 18, className: 'panel-loading-icon' })} aria-hidden />
            Loading folder sync…
          </p>
        ) : tab === 'history' ? (
          <div className="kb-folder-sync-history">
            {historyLoading ? (
              <p className="panel-loading" role="status">
                <Loader2 {...iconProps({ size: 18, className: 'panel-loading-icon' })} aria-hidden />
                Loading sync history…
              </p>
            ) : historyJobs.length === 0 ? (
              <p className="kb-folder-sync-history-empty">No folder sync jobs yet.</p>
            ) : (
              <div className="kb-folder-sync-history-table-wrap">
                <table className="kb-folder-sync-history-table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Status</th>
                      <th>Documents</th>
                      <th>Progress</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyJobs.map((job) => (
                      <tr key={job.id}>
                        <td>{formatWhen(job.created_at)}</td>
                        <td>
                          <span className={`kb-status-badge ${jobStatusClass(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td>{job.total_count}</td>
                        <td>
                          {job.completed_count} ok / {job.failed_count} failed
                        </td>
                        <td
                          className="kb-folder-sync-history-error"
                          title={job.error_message ?? undefined}
                        >
                          {job.error_message ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="kb-folder-sync-actions">
              <button type="button" className="btn-secondary" onClick={() => void loadHistory()}>
                <RefreshCw {...iconProps({ size: 16 })} aria-hidden />
                Refresh
              </button>
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form className="kb-folder-sync-form" onSubmit={(e) => void handleSave(e)}>
            <div className="kb-folder-sync-settings-block">
              <div className="kb-folder-sync-row">
                <div className="kb-folder-sync-row-label">
                  <span className="kb-folder-sync-row-title">Auto sync</span>
                  <span className="kb-folder-sync-row-hint">
                    Scan bound folders every {syncIntervalMinutes} minutes when enabled.
                  </span>
                </div>
                <div className="kb-folder-sync-row-control">
                  <input
                    type="checkbox"
                    className="brand-checkbox"
                    checked={autoSyncEnabled}
                    disabled={!canWrite}
                    aria-label="Auto sync"
                    onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                  />
                </div>
              </div>

              <div className="kb-folder-sync-row">
                <div className="kb-folder-sync-row-label">
                  <span className="kb-folder-sync-row-title">Include subfolders</span>
                  <span className="kb-folder-sync-row-hint">
                    Also import documents from nested channels under each bound folder.
                  </span>
                </div>
                <div className="kb-folder-sync-row-control">
                  <input
                    type="checkbox"
                    className="brand-checkbox"
                    checked={includeSubfolders}
                    disabled={!canWrite}
                    aria-label="Include subfolders"
                    onChange={(e) => setIncludeSubfolders(e.target.checked)}
                  />
                </div>
              </div>

              <div className="kb-folder-sync-row">
                <div className="kb-folder-sync-row-label">
                  <span className="kb-folder-sync-row-title">Interval (minutes)</span>
                  <span className="kb-folder-sync-row-hint">Allowed range: 5–1440.</span>
                </div>
                <div className="kb-folder-sync-row-control">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={syncIntervalMinutes}
                    disabled={!canWrite}
                    onChange={(e) => setSyncIntervalMinutes(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="kb-folder-sync-bound-folders">
              <span>Bound folders</span>
              <FolderChannelPicker
                channels={channels}
                selectedIds={channelIds}
                onChange={setChannelIds}
                disabled={!canWrite}
              />
            </div>

            {stats && (
              <div className="kb-folder-sync-stats">
                <span>Status</span>
                <ul>
                  <li>Unsynced: {stats.unsynced_count}</li>
                  <li>Failed: {stats.failed_count}</li>
                  <li>
                    Import:{' '}
                    {stats.import_in_progress || importJobActive ? 'In progress' : 'Idle'}
                  </li>
                  <li>Last auto sync: {formatWhen(config?.last_auto_sync_at ?? null)}</li>
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

            <div className="kb-folder-sync-actions">
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
