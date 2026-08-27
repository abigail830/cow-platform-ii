import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Eye, GitCompare, History, Loader2, Play, Plus, RotateCw, Trash2 } from 'lucide-react';
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
  type EvalRunAttempt,
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

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function evalItemDurationLabel(item: EvalRunItem | undefined): string | null {
  if (item?.duration_ms != null) {
    const formatted = formatDurationMs(item.duration_ms);
    return formatted || null;
  }
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

function attemptProgressLabel(attempt: EvalRunAttempt): string {
  const done = attempt.completed_run_items;
  const total = attempt.total_run_items;
  if (total === 0) return 'No items';
  if (attempt.status === 'running') return `${done}/${total} in progress`;
  return `${done}/${total} succeeded${attempt.failed_run_items ? ` · ${attempt.failed_run_items} failed` : ''}`;
}

function TranscriptPreview({ url }: { url: string }) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadingText, setLoadingText] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingText(true);
    setError('');
    void fetchPresignedStorageText(url)
      .then((text) => {
        if (cancelled) return;
        setBody(text ?? '(empty transcript)');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load transcript');
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loadingText) return <p className="admin-muted">Loading transcript…</p>;
  if (error) return <p className="admin-error">{error}</p>;
  return <pre className="asset-market-code eval-run-transcript-preview">{body}</pre>;
}

function EvalRunPipelineOutput({
  cell,
  variantName,
  runStatus,
  starting,
}: {
  cell: EvalRunItem | undefined;
  variantName: string;
  runStatus: EvalRunStatus;
  starting: boolean;
}) {
  const duration = evalItemDurationLabel(cell);

  return (
    <div className="eval-run-pipeline-col">
      <div className="eval-run-pipeline-col-header">
        <span className="eval-run-pipeline-col-name">{variantName}</span>
        <EvalRunItemStatusBadge item={cell} runStatus={runStatus} starting={starting} />
        {duration ? <span className="admin-muted eval-run-cell-duration">{duration}</span> : null}
      </div>
      <div className="eval-run-pipeline-col-body">
        {cell?.error_message ? (
          <p className="admin-error eval-run-cell-error">{cell.error_message}</p>
        ) : null}
        {cell?.stage === 'done' && cell.transcript_url ? (
          <TranscriptPreview url={cell.transcript_url} />
        ) : cell?.stage !== 'done' ? (
          <p className="admin-muted">Transcript not ready.</p>
        ) : (
          <p className="admin-muted">No transcript artifact.</p>
        )}
      </div>
    </div>
  );
}

function EvalRunAttemptSection({
  attempt,
  variants,
  datasetItemRows,
  runStatus,
  starting,
  defaultOpen,
  onCompare,
}: {
  attempt: EvalRunAttempt;
  variants: EvalRunDetail['variants'];
  datasetItemRows: Array<{ id: string; name: string }>;
  runStatus: EvalRunStatus;
  starting: boolean;
  defaultOpen: boolean;
  onCompare: (datasetItemId: string, attemptId: string) => void;
}) {
  const itemByVariantAndDataset = useMemo(() => {
    const map = new Map<string, EvalRunItem>();
    for (const item of attempt.items) {
      map.set(`${item.variant_id}:${item.dataset_item_id}`, item);
    }
    return map;
  }, [attempt.items]);

  const compareByDatasetItem = useMemo(() => {
    const map = new Map<string, EvalRunCompareRow>();
    for (const row of attempt.comparisons) {
      map.set(row.dataset_item_id, row);
    }
    return map;
  }, [attempt.comparisons]);

  const isComparingPhase = attempt.phase === 'comparing' && attempt.status === 'running';
  const durationLabel = attempt.duration_ms ? formatDurationMs(attempt.duration_ms) : null;

  return (
    <details className="eval-run-attempt" open={defaultOpen}>
      <summary className="eval-run-attempt-summary">
        <span className="eval-run-attempt-title">
          <History {...iconProps({ size: 16 })} className="eval-run-attempt-icon" aria-hidden />
          Run #{attempt.attempt_number} · {formatDateTime(attempt.started_at)}
        </span>
        <span className={`document-status-badge eval-run-status-badge ${stageClass(attempt.status)}`}>
          {formatEvalRunStatus(attempt.status)}
        </span>
        <span className="admin-muted eval-run-attempt-meta">
          {attempt.run_mode === 'full' ? 'Full' : 'Pipeline only'} · {attemptProgressLabel(attempt)}
          {durationLabel ? ` · ${durationLabel}` : ''}
        </span>
      </summary>

      <div className="eval-run-attempt-body">
        {datasetItemRows.length === 0 ? (
          <p className="admin-muted">No files in this run.</p>
        ) : (
          datasetItemRows.map((row) => {
            const itemRunStatus = attempt.status === 'running' ? 'running' : runStatus;
            const itemStarting = starting && attempt.status === 'running';

            return (
            <details key={row.id} className="eval-run-file-block">
              <summary className="eval-run-file-summary">
                <span className="eval-run-file-name">{row.name}</span>
                <div className="eval-run-file-pipeline-row">
                  {variants.map((variant) => {
                    const cell = itemByVariantAndDataset.get(`${variant.id}:${row.id}`);
                    const duration = evalItemDurationLabel(cell);
                    return (
                      <span key={variant.id} className="eval-run-pipeline-chip">
                        <span className="eval-run-pipeline-chip-name">{variant.display_name}</span>
                        <EvalRunItemStatusBadge
                          item={cell}
                          runStatus={itemRunStatus}
                          starting={itemStarting}
                        />
                        {duration ? (
                          <span className="admin-muted eval-run-cell-duration">{duration}</span>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </summary>

              <div className="eval-run-file-body">
                <div
                  className="eval-run-pipeline-grid"
                  style={{ ['--pipeline-cols' as string]: String(Math.max(variants.length, 1)) }}
                >
                  {variants.map((variant) => {
                    const cell = itemByVariantAndDataset.get(`${variant.id}:${row.id}`);
                    return (
                      <EvalRunPipelineOutput
                        key={variant.id}
                        cell={cell}
                        variantName={variant.display_name}
                        runStatus={itemRunStatus}
                        starting={itemStarting}
                      />
                    );
                  })}
                </div>

                {attempt.run_mode === 'full' ? (
                  <div className="eval-run-compare-row">
                    {isComparingPhase || compareByDatasetItem.has(row.id) ? (
                      <span
                        className={`${compareStatusClass(compareByDatasetItem.get(row.id)?.status ?? 'pending')} eval-run-status-badge`}
                      >
                        {(compareByDatasetItem.get(row.id)?.status ??
                          (isComparingPhase ? 'running' : 'pending')) === 'running' ? (
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
                      className="btn-secondary eval-run-compare-btn"
                      onClick={() => onCompare(row.id, attempt.id)}
                      disabled={
                        isComparingPhase ||
                        (compareByDatasetItem.get(row.id)?.status !== 'done' &&
                          attempt.status === 'running')
                      }
                    >
                      <GitCompare {...iconProps()} aria-hidden />
                      Compare transcripts
                    </button>
                  </div>
                ) : null}
              </div>
            </details>
            );
          })
        )}
      </div>
    </details>
  );
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
              <th>Files</th>
              <th>Last run</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-table-empty">
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
                    <Link to={`/evaluation/runs/${run.id}`} className="admin-link eval-run-list-name">
                      <History {...iconProps({ size: 16 })} className="eval-run-list-icon" aria-hidden />
                      {run.name}
                    </Link>
                  </td>
                  <td>{datasetNameById.get(run.dataset_id) ?? run.dataset_id.slice(0, 8)}</td>
                  <td>{run.file_count ?? '—'}</td>
                  <td>{run.last_run_at ? formatDateTime(run.last_run_at) : '—'}</td>
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
    if (detail.dataset_items?.length) {
      return detail.dataset_items.map((row) => ({ id: row.id, name: row.name }));
    }
    const names = new Map<string, string>();
    for (const attempt of detail.attempts ?? []) {
      for (const item of attempt.items) {
        if (item.dataset_item_name) names.set(item.dataset_item_id, item.dataset_item_name);
      }
    }
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  }, [detail]);

  const fileCount =
    detail?.run.status === 'draft'
      ? (datasetItemCount ?? detail?.dataset_items?.length ?? 0)
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

  async function openCompare(datasetItemId: string, attemptId: string) {
    if (!runId) return;
    setCompareItemId(datasetItemId);
    setCompareLoading(true);
    setComparePanels([]);
    try {
      const comparison = await getEvalRunCompare(runId, datasetItemId, attemptId);
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
              {(detail.attempts?.length ?? 0) > 0
                ? ` · ${detail.attempts.length} run${detail.attempts.length === 1 ? '' : 's'}`
                : ''}
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

      <div className="eval-run-attempts">
        {loading && !detail ? (
          <p className="admin-muted">Loading…</p>
        ) : !detail ? (
          <p className="admin-muted">Evaluation run not found.</p>
        ) : detail.run.status === 'draft' && (detail.attempts?.length ?? 0) === 0 ? (
          <p className="admin-muted">
            Ready to transcribe {fileCount} file{fileCount === 1 ? '' : 's'}. Choose a run mode above.
          </p>
        ) : (detail.attempts?.length ?? 0) === 0 ? (
          <p className="admin-muted">No run history yet.</p>
        ) : (
          detail.attempts.map((attempt, index) => (
            <EvalRunAttemptSection
              key={attempt.id}
              attempt={attempt}
              variants={detail.variants}
              datasetItemRows={datasetItemRows}
              runStatus={displayRunStatus ?? detail.run.status}
              starting={starting}
              defaultOpen={index === 0}
              onCompare={(datasetItemId, attemptId) => void openCompare(datasetItemId, attemptId)}
            />
          ))
        )}
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
