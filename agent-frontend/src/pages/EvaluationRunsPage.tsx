import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Eye, GitCompare, Loader2, Play, Plus, RotateCw, Trash2 } from 'lucide-react';
import { getEvalDataset, listEvalDatasets, type EvalDataset } from '../api/evaluation/datasets.ts';
import {
  createEvalRun,
  deleteEvalRun,
  formatEvalRunPhase,
  formatEvalRunStatus,
  getEvalRunCompare,
  getEvalRunDetail,
  listEvalRunProcessingOptions,
  listEvalRuns,
  startEvalRun,
  type EvalRun,
  type EvalRunDetail,
  type EvalRunCompareRow,
  type EvalRunCompareStatus,
  type EvalRunItem,
  type EvalRunItemStage,
  type EvalRunMode,
  type EvalRunProcessingOption,
  type EvalRunStatus,
} from '../api/evaluation/runs.ts';
import { EvalRunCreateModal } from '../components/EvalRunModals.tsx';
import { TransientNotice } from '../components/TransientNotice.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { useTransientNotice } from '../hooks/useTransientNotice.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import { fetchPresignedStorageText } from '../api/storage-fetch.ts';

const LIST_PAGE = getNavPage('/evaluation/runs')!;

function itemDispatchClaimed(item: EvalRunItem | undefined): boolean {
  if (!item?.metrics || typeof item.metrics !== 'object' || Array.isArray(item.metrics)) return false;
  return Boolean((item.metrics as Record<string, unknown>).dispatch_claimed_at);
}

function isEvalItemActive(item: EvalRunItem | undefined, runStatus: EvalRunStatus): boolean {
  if (!item || runStatus !== 'running') return false;
  if (item.stage === 'transcribing') return true;
  return item.stage === 'submitted' && itemDispatchClaimed(item);
}

function isEvalItemQueued(item: EvalRunItem | undefined, runStatus: EvalRunStatus): boolean {
  if (!item || runStatus !== 'running') return false;
  return item.stage === 'submitted' && !itemDispatchClaimed(item);
}

function EvalRunStatusBadge({ status }: { status: EvalRunStatus }) {
  if (status === 'running') {
    return (
      <span className="document-status-badge status-running eval-run-status-badge">
        <Loader2 {...iconProps({ size: 12, className: 'icon-btn-spin' })} aria-hidden />
        {formatEvalRunStatus(status)}
      </span>
    );
  }
  return (
    <span className={stageClass(status)}>
      {formatEvalRunStatus(status)}
    </span>
  );
}

function EvalRunItemStatusBadge({
  item,
  runStatus,
  starting,
}: {
  item: EvalRunItem | undefined;
  runStatus: EvalRunStatus;
  starting: boolean;
}) {
  const stage = item?.stage ?? 'submitted';

  if (starting && stage !== 'done' && stage !== 'failed') {
    return (
      <span className="document-status-badge status-running eval-run-status-badge">
        <Loader2 {...iconProps({ size: 12, className: 'icon-btn-spin' })} aria-hidden />
        Starting…
      </span>
    );
  }

  if (isEvalItemActive(item, runStatus)) {
    return (
      <span className="document-status-badge status-running eval-run-status-badge">
        <Loader2 {...iconProps({ size: 12, className: 'icon-btn-spin' })} aria-hidden />
        {stage === 'transcribing' ? 'Transcribing…' : 'Running…'}
      </span>
    );
  }

  if (isEvalItemQueued(item, runStatus)) {
    return <span className="document-status-badge">Queued</span>;
  }

  return <span className={stageClass(stage)}>{stageLabel(stage)}</span>;
}

function stageLabel(stage: EvalRunItemStage): string {
  if (stage === 'done') return 'Done';
  if (stage === 'failed') return 'Failed';
  if (stage === 'transcribing') return 'Transcribing';
  if (stage === 'cancelled') return 'Cancelled';
  return 'Submitted';
}

function stageClass(stage: EvalRunItemStage | EvalRun['status']): string {
  if (stage === 'done' || stage === 'completed') return 'document-status-badge status-completed';
  if (stage === 'failed' || stage === 'cancelled' || stage === 'completed_with_errors') {
    return 'document-status-badge status-failed';
  }
  if (stage === 'running' || stage === 'transcribing') return 'document-status-badge status-running';
  return 'document-status-badge';
}

function compareStatusLabel(status: EvalRunCompareStatus): string {
  if (status === 'done') return 'Compared';
  if (status === 'failed') return 'Compare failed';
  if (status === 'running') return 'Comparing…';
  return 'Pending';
}

function compareStatusClass(status: EvalRunCompareStatus): string {
  if (status === 'done') return 'document-status-badge status-completed';
  if (status === 'failed') return 'document-status-badge status-failed';
  if (status === 'running') return 'document-status-badge status-running';
  return 'document-status-badge';
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function evalItemDurationLabel(item: EvalRunItem | undefined): string | null {
  if (!item?.metrics || typeof item.metrics !== 'object') return null;
  const metrics = item.metrics as Record<string, unknown>;
  const durationMs =
    typeof metrics.asr_duration_ms === 'number'
      ? metrics.asr_duration_ms
      : typeof metrics.worker_duration_ms === 'number'
        ? metrics.worker_duration_ms
        : null;
  if (durationMs == null) return null;
  const formatted = formatDurationMs(durationMs);
  return formatted || null;
}

export function EvaluationRunsListPage() {
  const navigate = useNavigate();
  const { user } = useAppOutletContext();
  const canRead = useMemo(() => hasPermission(user, 'evaluation:runs', 'read'), [user]);
  const canWrite = useMemo(() => hasPermission(user, 'evaluation:runs', 'write'), [user]);

  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [datasets, setDatasets] = useState<EvalDataset[]>([]);
  const [pipelines, setPipelines] = useState<EvalRunProcessingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EvalRun | null>(null);
  const [deleting, setDeleting] = useState(false);

  const datasetNameById = useMemo(() => new Map(datasets.map((d) => [d.id, d.name])), [datasets]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [runRows, datasetRows, options] = await Promise.all([
        listEvalRuns(),
        listEvalDatasets(),
        listEvalRunProcessingOptions(),
      ]);
      setRuns(runRows);
      setDatasets(datasetRows.filter((d) => d.media_type === 'audio'));
      setPipelines(options.transcription_pipelines);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evaluation runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canRead) return <Navigate to="/agents/playground" replace />;

  function openCreateModal() {
    setModalOpen(true);
  }

  async function handleCreate(input: {
    name: string;
    description: string;
    datasetId: string;
    pipelineConfigIds: string[];
    runMode: EvalRunMode;
  }) {
    const created = await createEvalRun({
      dataset_id: input.datasetId,
      name: input.name,
      description: input.description || undefined,
      pipeline_config_ids: input.pipelineConfigIds,
      run_mode: input.runMode,
    });
    setModalOpen(false);
    await load();
    navigate(`/evaluation/runs/${created.run.id}`);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await deleteEvalRun(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete run');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <AdminPageTitle main={LIST_PAGE.titleMain} accent={LIST_PAGE.titleAccent} />
        <AdminPageDescription>
          Compare multiple ASR pipelines on the same audio dataset. Create a run, start transcription, then
          review transcripts side by side.
        </AdminPageDescription>
      </header>

      <div className="admin-toolbar">
        <div className="admin-toolbar-left" />
        {canWrite ? (
          <button type="button" className="btn-primary" onClick={openCreateModal}>
            <Plus {...iconProps()} aria-hidden />
            New run
          </button>
        ) : null}
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Dataset</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Updated</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  No evaluation runs yet.{' '}
                  {canWrite ? (
                    <>
                      <button type="button" className="btn-link" onClick={openCreateModal}>
                        Create one
                      </button>{' '}
                      after uploading a dataset.
                    </>
                  ) : (
                    'Ask an admin to create one.'
                  )}
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link to={`/evaluation/runs/${run.id}`} className="admin-link">
                      {run.name}
                    </Link>
                  </td>
                  <td>{datasetNameById.get(run.dataset_id) ?? run.dataset_id.slice(0, 8)}</td>
                  <td>
                    <EvalRunStatusBadge status={run.status} />
                  </td>
                  <td>
                    {run.status === 'draft'
                      ? '—'
                      : `${run.completed_run_items}/${run.total_run_items}${run.failed_run_items ? ` (${run.failed_run_items} failed)` : ''}`}
                  </td>
                  <td>{new Date(run.updated_at).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/evaluation/runs/${run.id}`} className="icon-btn" title="View">
                        <Eye {...iconProps()} aria-hidden />
                      </Link>
                      {canWrite && run.status !== 'running' ? (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Delete"
                          onClick={() => setDeleteTarget(run)}
                        >
                          <Trash2 {...iconProps()} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <EvalRunCreateModal
          datasets={datasets}
          pipelines={pipelines}
          onCancel={() => setModalOpen(false)}
          onCreate={handleCreate}
        />
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Delete run?</h2>
            <p>
              Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleDelete()} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EvaluationRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { user } = useAppOutletContext();
  const canRead = useMemo(() => hasPermission(user, 'evaluation:runs', 'read'), [user]);
  const canWrite = useMemo(() => hasPermission(user, 'evaluation:runs', 'write'), [user]);

  const [detail, setDetail] = useState<EvalRunDetail | null>(null);
  const [datasetItemCount, setDatasetItemCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startingMode, setStartingMode] = useState<EvalRunMode | null>(null);
  const [fastPollUntil, setFastPollUntil] = useState<number | null>(null);
  const { notice, noticeVariant, showNotice } = useTransientNotice(6000);
  const [compareItemId, setCompareItemId] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [comparePanels, setComparePanels] = useState<Array<{ title: string; body: string; error?: string }>>([]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!runId) return;
    if (!options?.silent) setLoading(true);
    try {
      const detailData = await getEvalRunDetail(runId);
      setDetail(detailData);
      try {
        const dataset = await getEvalDataset(detailData.run.dataset_id);
        setDatasetItemCount(dataset.item_count);
      } catch {
        setDatasetItemCount(null);
      }
    } catch (err) {
      if (!options?.silent) {
        showNotice(err instanceof Error ? err.message : 'Failed to load run', 'error');
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [runId, showNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail || detail.run.status !== 'running') return;
    const intervalMs = fastPollUntil != null && Date.now() < fastPollUntil ? 2000 : 5000;
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [detail, load, fastPollUntil]);

  const displayRunStatus = starting ? 'running' : detail?.run.status;
  const isRunActive = displayRunStatus === 'running';
  const activeRunMode = starting && startingMode ? startingMode : detail?.run.run_mode;
  const canTriggerRun = canWrite && detail != null && !starting && !isRunActive;
  const RunActionIcon = detail?.run.status === 'draft' ? Play : RotateCw;

  const datasetItemRows = useMemo(() => {
    if (!detail) return [];
    const names = new Map<string, string>();
    for (const item of detail.items) {
      if (item.dataset_item_name) names.set(item.dataset_item_id, item.dataset_item_name);
    }
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  }, [detail]);

  const variantColumns = detail?.variants ?? [];

  const itemByVariantAndDataset = useMemo(() => {
    const map = new Map<string, EvalRunItem>();
    if (!detail) return map;
    for (const item of detail.items) {
      map.set(`${item.variant_id}:${item.dataset_item_id}`, item);
    }
    return map;
  }, [detail]);

  const compareByDatasetItem = useMemo(() => {
    const map = new Map<string, EvalRunCompareRow>();
    if (!detail?.comparisons) return map;
    for (const row of detail.comparisons) {
      map.set(row.dataset_item_id, row);
    }
    return map;
  }, [detail]);

  const isComparingPhase = detail?.run.phase === 'comparing';

  const fileCount =
    detail?.run.status === 'draft'
      ? (datasetItemCount ?? 0)
      : datasetItemRows.length;

  if (!canRead) return <Navigate to="/agents/playground" replace />;
  if (!runId) return <Navigate to="/evaluation/runs" replace />;

  async function handleStart(runMode: EvalRunMode) {
    if (!runId) return;
    setStarting(true);
    setStartingMode(runMode);
    try {
      const result = await startEvalRun(runId, { run_mode: runMode });
      setDetail(result);
      setFastPollUntil(Date.now() + 60_000);
      const isDraft = detail?.run.status === 'draft';
      showNotice(
        isDraft ? 'Evaluation run started' : 'Evaluation run restarted',
        'success',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start run';
      showNotice(message, 'error');
      await load({ silent: true });
    } finally {
      setStarting(false);
      setStartingMode(null);
    }
  }

  function runModeButtonLabel(mode: EvalRunMode, action: 'start' | 'restart'): string {
    const prefix = action === 'start' ? 'Run' : 'Restart';
    if (isRunActive && activeRunMode === mode) return 'Running…';
    if (starting && startingMode === mode) return action === 'start' ? 'Starting…' : 'Restarting…';
    return mode === 'full' ? `${prefix} full` : `${prefix} pipeline only`;
  }

  async function openCompare(datasetItemId: string) {
    if (!runId) return;
    setCompareItemId(datasetItemId);
    setCompareLoading(true);
    setComparePanels([]);
    try {
      const comparison = await getEvalRunCompare(runId, datasetItemId);
      const panels = await Promise.all(
        comparison.comparisons.map(async (entry) => {
          if (entry.stage !== 'done' || !entry.transcript_url) {
            return {
              title: entry.display_name,
              body: '',
              error: entry.error_message ?? `Stage: ${stageLabel(entry.stage)}`,
            };
          }
          const text = await fetchPresignedStorageText(entry.transcript_url);
          return {
            title: entry.display_name,
            body: text ?? '(empty transcript)',
          };
        }),
      );
      setComparePanels(panels);
    } catch (err) {
      setComparePanels([
        { title: 'Error', body: '', error: err instanceof Error ? err.message : 'Failed to load transcripts' },
      ]);
    } finally {
      setCompareLoading(false);
    }
  }

  return (
    <div className="admin-page">
      <TransientNotice message={notice} variant={noticeVariant} />
      <Link to="/evaluation/runs" className="kb-back-link">
        ← back Evaluation
      </Link>

      <header className="admin-header">
        <AdminPageTitle main={detail?.run.name ?? (loading ? 'Loading…' : '…')} accent="" />
      </header>

      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          {detail ? (
            <p className="admin-toolbar-meta">
              {formatEvalRunStatus(displayRunStatus ?? detail.run.status)}
              {detail.run.status === 'running' ? ` · ${formatEvalRunPhase(detail.run.phase)}` : ''}
              {detail.run.run_mode === 'full' ? ' · Full' : ' · Pipeline only'} · {detail.variants.length}{' '}
              pipeline
              {detail.variants.length === 1 ? '' : 's'} · {fileCount} file{fileCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
        <div className="admin-toolbar-actions eval-run-toolbar-actions">
          {canWrite && detail ? (
            <>
              <button
                type="button"
                className={
                  isRunActive && activeRunMode === 'pipeline_only'
                    ? 'btn-primary'
                    : 'btn-secondary'
                }
                onClick={() => void handleStart('pipeline_only')}
                disabled={!canTriggerRun}
              >
                {isRunActive && activeRunMode === 'pipeline_only' ? (
                  <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                ) : (
                  <RunActionIcon {...iconProps()} aria-hidden />
                )}
                {runModeButtonLabel(
                  'pipeline_only',
                  detail.run.status === 'draft' ? 'start' : 'restart',
                )}
              </button>
              <button
                type="button"
                className={isRunActive && activeRunMode === 'full' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => void handleStart('full')}
                disabled={!canTriggerRun}
              >
                {isRunActive && activeRunMode === 'full' ? (
                  <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                ) : (
                  <RunActionIcon {...iconProps()} aria-hidden />
                )}
                {runModeButtonLabel('full', detail.run.status === 'draft' ? 'start' : 'restart')}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void load({ silent: Boolean(detail) })}
            disabled={loading && !detail}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>File</th>
              {(detail?.variants ?? []).map((variant) => (
                <th key={variant.id}>{variant.display_name}</th>
              ))}
              {loading && !detail ? null : <th>Compare</th>}
            </tr>
          </thead>
          <tbody>
            {loading && !detail ? (
              <tr>
                <td colSpan={99} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : !detail ? (
              <tr>
                <td colSpan={99} className="admin-table-empty">
                  Evaluation run not found.
                </td>
              </tr>
            ) : datasetItemRows.length === 0 ? (
              <tr>
                <td colSpan={variantColumns.length + 2} className="admin-table-empty">
                  {detail.run.status === 'draft'
                    ? `Ready to transcribe ${fileCount} file${fileCount === 1 ? '' : 's'}. Choose a run mode above.`
                    : 'No files in this run.'}
                </td>
              </tr>
            ) : (
              datasetItemRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  {variantColumns.map((variant) => {
                    const cell = itemByVariantAndDataset.get(`${variant.id}:${row.id}`);
                    return (
                      <td key={variant.id}>
                        <EvalRunItemStatusBadge
                          item={cell}
                          runStatus={displayRunStatus ?? detail.run.status}
                          starting={starting}
                        />
                        {evalItemDurationLabel(cell) ? (
                          <div className="admin-muted eval-run-cell-duration">{evalItemDurationLabel(cell)}</div>
                        ) : null}
                        {cell?.error_message ? (
                          <div className="admin-muted eval-run-cell-error" title={cell.error_message}>
                            {cell.error_message}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                  <td>
                    <div className="row-actions eval-run-compare-cell">
                      {detail.run.run_mode === 'full' && (isComparingPhase || compareByDatasetItem.has(row.id)) ? (
                        <span
                          className={`${compareStatusClass(compareByDatasetItem.get(row.id)?.status ?? 'pending')} eval-run-status-badge`}
                        >
                          {(compareByDatasetItem.get(row.id)?.status ?? (isComparingPhase ? 'running' : 'pending')) ===
                          'running' ? (
                            <Loader2 {...iconProps({ size: 12, className: 'icon-btn-spin' })} aria-hidden />
                          ) : null}
                          {compareStatusLabel(
                            compareByDatasetItem.get(row.id)?.status ??
                              (isComparingPhase ? 'running' : 'pending'),
                          )}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn"
                        title="Compare transcripts"
                        aria-label={`Compare transcripts for ${row.name}`}
                        onClick={() => void openCompare(row.id)}
                        disabled={
                          isComparingPhase ||
                          (detail.run.run_mode === 'full' &&
                            compareByDatasetItem.get(row.id)?.status !== 'done' &&
                            detail.run.status === 'running')
                        }
                      >
                        <GitCompare {...iconProps()} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {compareItemId ? (
            <div className="modal-backdrop" onClick={() => setCompareItemId(null)}>
              <div
                className="modal-card"
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
              >
                <h2>Transcript comparison</h2>
                {compareLoading ? (
                  <p>Loading transcripts…</p>
                ) : (
                  <div className="form-grid">
                    {comparePanels.map((panel) => (
                      <section key={panel.title} className="form-field form-field-wide">
                        <h3>{panel.title}</h3>
                        {panel.error ? (
                          <p className="admin-error">{panel.error}</p>
                        ) : (
                          <pre className="asset-market-code">{panel.body}</pre>
                        )}
                      </section>
                    ))}
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setCompareItemId(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null}
    </div>
  );
}
