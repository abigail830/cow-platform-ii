import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Eye, FolderOpen, GitCompare, History, Loader2, Play, Plus, Trash2 } from 'lucide-react';
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
  uploadEvalRunFile,
  type EvalRun,
  type EvalRunAttempt,
  type EvalRunDetail,
  type EvalRunCompareRow,
  type EvalRunCompareStatus,
  type EvalRunJudgeRow,
  type EvalRunJudgeStatus,
  type EvalRunItem,
  type EvalRunItemStage,
  type EvalRunMode,
  type EvalRunProcessingOption,
  type EvalRunStatus,
} from '../api/evaluation/runs.ts';
import { EvalRunCreateModal, EvalRunFilesModal } from '../components/EvalRunModals.tsx';
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

function judgeStatusLabel(status: EvalRunJudgeStatus): string {
  if (status === 'done') return 'Compared';
  if (status === 'failed') return 'Compare failed';
  if (status === 'running') return 'Comparing…';
  return 'Pending';
}

function judgeStatusClass(status: EvalRunJudgeStatus): string {
  if (status === 'done') return 'document-status-badge status-completed';
  if (status === 'failed') return 'document-status-badge status-failed';
  if (status === 'running') return 'document-status-badge status-running';
  return 'document-status-badge';
}

function activeJudgeFileName(attempt: EvalRunAttempt): string | null {
  const running = attempt.judge_jobs.find((row) => row.status === 'running');
  if (running?.dataset_item_name) return running.dataset_item_name;
  const pending = attempt.judge_jobs.find((row) => row.status === 'pending');
  if (pending?.dataset_item_name) return pending.dataset_item_name;
  return null;
}

function activeCompareFileName(attempt: EvalRunAttempt): string | null {
  const running = attempt.comparisons.find((row) => row.status === 'running');
  if (running?.dataset_item_name) return running.dataset_item_name;
  const pending = attempt.comparisons.find((row) => row.status === 'pending');
  if (pending?.dataset_item_name) return pending.dataset_item_name;
  return null;
}

function attemptProgressLabel(attempt: EvalRunAttempt): string {
  if (attempt.phase === 'judging' && attempt.status === 'running') {
    const done =
      attempt.judge_jobs.length > 0
        ? attempt.judge_jobs.filter((row) => row.status === 'done').length
        : attempt.completed_compare_items;
    const total =
      attempt.judge_jobs.length > 0
        ? attempt.judge_jobs.length
        : attempt.total_compare_items;
    if (total === 0) return 'Comparing';
    const active = activeJudgeFileName(attempt);
    const progress = `${done}/${total} comparing`;
    return active ? `${progress} · ${active}` : progress;
  }
  if (attempt.phase === 'comparing' && attempt.status === 'running') {
    const done = attempt.completed_compare_items;
    const total = attempt.total_compare_items;
    if (total === 0) return 'Comparing';
    const active = activeCompareFileName(attempt);
    const progress = `${done}/${total} comparing`;
    return active ? `${progress} · ${active}` : progress;
  }
  if (attempt.phase === 'judging' && attempt.status === 'running') {
    return 'Comparing';
  }

  const done = attempt.completed_run_items;
  const total = attempt.total_run_items;
  if (total === 0) return 'No items';
  if (attempt.status === 'running') {
    if (attempt.phase === 'transcribing') return `${done}/${total} transcribing`;
    return `${done}/${total} in progress`;
  }
  return `${done}/${total} succeeded${attempt.failed_run_items ? ` · ${attempt.failed_run_items} failed` : ''}`;
}

function attemptStatusBadge(attempt: EvalRunAttempt): { label: string; className: string; showSpinner: boolean } {
  if (attempt.status === 'running' && (attempt.phase === 'comparing' || attempt.phase === 'judging')) {
    return {
      label: `${formatEvalRunPhase(attempt.phase)}…`,
      className: 'document-status-badge status-running eval-run-status-badge',
      showSpinner: true,
    };
  }
  return {
    label: formatEvalRunStatus(attempt.status),
    className: `document-status-badge eval-run-status-badge ${stageClass(attempt.status)}`,
    showSpinner: false,
  };
}

function EvalRunJudgeScores({
  job,
  variants,
}: {
  job: EvalRunJudgeRow | undefined;
  variants: EvalRunDetail['variants'];
}) {
  if (!job?.summary_metrics || job.status !== 'done') return null;

  const metrics = job.summary_metrics;
  const variantScores = metrics.variant_scores as Record<
    string,
    Record<string, { label?: string; score?: number; reason?: string }>
  > | undefined;
  const pairwise = metrics.pairwise as Record<
    string,
    { label?: string; score?: number; winner?: string; winner_variant_id?: string | null; reason?: string }
  > | undefined;

  const variantById = new Map(variants.map((variant) => [variant.id, variant.display_name]));

  return (
    <div className="eval-run-judge-scores">
      {variantScores && Object.keys(variantScores).length > 0 ? (
        <div className="eval-run-judge-section">
          <p className="eval-run-judge-section-title">Per pipeline</p>
          <div className="eval-run-judge-score-grid">
            {Object.entries(variantScores).map(([variantId, dimensions]) => (
              <div key={variantId} className="eval-run-judge-score-card">
                <p className="eval-run-judge-score-card-title">{variantById.get(variantId) ?? variantId}</p>
                <ul className="eval-run-judge-dimension-list">
                  {Object.entries(dimensions).map(([dimensionId, row]) => (
                    <li key={dimensionId}>
                      <span className="eval-run-judge-dimension-label">{row.label ?? dimensionId}</span>
                      <span className="eval-run-judge-dimension-value">
                        {typeof row.score === 'number' ? row.score.toFixed(2) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {pairwise && Object.keys(pairwise).length > 0 ? (
        <div className="eval-run-judge-section">
          <p className="eval-run-judge-section-title">Pairwise</p>
          <ul className="eval-run-judge-dimension-list eval-run-judge-dimension-list-pairwise">
            {Object.entries(pairwise).map(([dimensionId, row]) => (
              <li key={dimensionId}>
                <span className="eval-run-judge-dimension-label">{row.label ?? dimensionId}</span>
                <span className="eval-run-judge-dimension-value">
                  {row.winner
                    ? row.winner === 'tie'
                      ? 'Tie'
                      : variantById.get(row.winner_variant_id ?? '') ?? row.winner.toUpperCase()
                    : typeof row.score === 'number'
                      ? row.score.toFixed(2)
                      : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
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
  runStatus,
  starting,
  defaultOpen,
  onCompare,
}: {
  attempt: EvalRunAttempt;
  variants: EvalRunDetail['variants'];
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

  const datasetItemRows = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of attempt.items) {
      if (item.dataset_item_name) {
        names.set(item.dataset_item_id, item.dataset_item_name);
      }
    }
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  }, [attempt.items]);

  const compareByDatasetItem = useMemo(() => {
    const map = new Map<string, EvalRunCompareRow>();
    for (const row of attempt.comparisons) {
      map.set(row.dataset_item_id, row);
    }
    return map;
  }, [attempt.comparisons]);

  const judgeByDatasetItem = useMemo(() => {
    const map = new Map<string, EvalRunJudgeRow>();
    for (const row of attempt.judge_jobs) {
      map.set(row.dataset_item_id, row);
    }
    return map;
  }, [attempt.judge_jobs]);

  const isComparingPhase = attempt.phase === 'comparing' && attempt.status === 'running';
  const isJudgingPhase = attempt.phase === 'judging' && attempt.status === 'running';
  const durationLabel = attempt.duration_ms ? formatDurationMs(attempt.duration_ms) : null;
  const statusBadge = attemptStatusBadge(attempt);

  return (
    <details className="eval-run-attempt" open={defaultOpen}>
      <summary className="eval-run-attempt-summary">
        <span className="eval-run-attempt-title">
          <History {...iconProps({ size: 16 })} className="eval-run-attempt-icon" aria-hidden />
          Run #{attempt.attempt_number} · {formatDateTime(attempt.started_at)}
        </span>
        <span className={statusBadge.className}>
          {statusBadge.showSpinner ? (
            <Loader2 {...iconProps({ size: 12, className: 'icon-btn-spin' })} aria-hidden />
          ) : null}
          {statusBadge.label}
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
                    {isJudgingPhase || judgeByDatasetItem.has(row.id) ? (
                      <span
                        className={`${judgeStatusClass(judgeByDatasetItem.get(row.id)?.status ?? 'pending')} eval-run-status-badge`}
                      >
                        {judgeByDatasetItem.get(row.id)?.status === 'running' ? (
                          <Loader2 {...iconProps({ size: 12, className: 'icon-btn-spin' })} aria-hidden />
                        ) : null}
                        {judgeStatusLabel(judgeByDatasetItem.get(row.id)?.status ?? 'pending')}
                      </span>
                    ) : isComparingPhase || compareByDatasetItem.has(row.id) ? (
                      <span
                        className={`${compareStatusClass(compareByDatasetItem.get(row.id)?.status ?? 'pending')} eval-run-status-badge`}
                      >
                        {compareByDatasetItem.get(row.id)?.status === 'running' ? (
                          <Loader2 {...iconProps({ size: 12, className: 'icon-btn-spin' })} aria-hidden />
                        ) : null}
                        {compareStatusLabel(compareByDatasetItem.get(row.id)?.status ?? 'pending')}
                      </span>
                    ) : null}
                    {judgeByDatasetItem.get(row.id)?.error_message ? (
                      <p className="admin-error eval-run-cell-error">{judgeByDatasetItem.get(row.id)?.error_message}</p>
                    ) : null}
                    <EvalRunJudgeScores job={judgeByDatasetItem.get(row.id)} variants={variants} />
                    <button
                      type="button"
                      className="btn-secondary eval-run-compare-btn"
                      onClick={() => onCompare(row.id, attempt.id)}
                      disabled={
                        variants.filter(
                          (variant) =>
                            itemByVariantAndDataset.get(`${variant.id}:${row.id}`)?.stage === 'done',
                        ).length < 2
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
  const [pipelines, setPipelines] = useState<EvalRunProcessingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [filesTarget, setFilesTarget] = useState<EvalRun | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EvalRun | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [runRows, options] = await Promise.all([
        listEvalRuns(),
        listEvalRunProcessingOptions(),
      ]);
      setRuns(runRows);
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
    pipelineConfigIds: string[];
    runMode: EvalRunMode;
    files: File[];
  }) {
    const created = await createEvalRun({
      name: input.name,
      description: input.description || undefined,
      pipeline_config_ids: input.pipelineConfigIds,
      run_mode: input.runMode,
    });
    for (const file of input.files) {
      await uploadEvalRunFile(created.run.id, file, created.run.dataset_id);
    }
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
          Compare multiple ASR pipelines on the same audio files. Create an evaluation set, manage files on the
          list page, then start transcription from the detail page.
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
              <th>Files</th>
              <th>Last run</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="admin-table-empty">
                  No evaluation runs yet.{' '}
                  {canWrite ? (
                    <>
                      <button type="button" className="btn-link" onClick={openCreateModal}>
                        Create one
                      </button>{' '}
                      and upload audio files.
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
                  <td>
                    <button
                      type="button"
                      className="btn-link eval-run-files-count"
                      onClick={() => setFilesTarget(run)}
                      title="Manage files"
                    >
                      {run.file_count ?? 0}
                    </button>
                  </td>
                  <td>{run.last_run_at ? formatDateTime(run.last_run_at) : '—'}</td>
                  <td>
                    <div className="row-actions">
                      {canWrite ? (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Manage files"
                          onClick={() => setFilesTarget(run)}
                        >
                          <FolderOpen {...iconProps()} aria-hidden />
                        </button>
                      ) : null}
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
          pipelines={pipelines}
          onCancel={() => setModalOpen(false)}
          onCreate={handleCreate}
        />
      ) : null}

      {filesTarget ? (
        <EvalRunFilesModal
          runId={filesTarget.id}
          datasetId={filesTarget.dataset_id}
          runName={filesTarget.name}
          runStatus={filesTarget.status}
          fileCount={filesTarget.file_count ?? 0}
          canWrite={canWrite}
          onCancel={() => setFilesTarget(null)}
          onChanged={() => void load()}
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
  const canTriggerRun =
    canWrite && detail != null && !starting && !isRunActive && (detail.dataset_items?.length ?? 0) > 0;
  const RunActionIcon = Play;

  const fileCount = detail?.dataset_items?.length ?? 0;

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
      showNotice('Run started', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start run';
      showNotice(message, 'error');
      await load({ silent: true });
    } finally {
      setStarting(false);
      setStartingMode(null);
    }
  }

  function runModeButtonLabel(mode: EvalRunMode): string {
    if (isRunActive && activeRunMode === mode) return 'Running…';
    if (starting && startingMode === mode) return 'Starting…';
    return mode === 'full' ? 'Run full' : 'Run pipeline only';
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
              {detail.variants.length === 1 ? '' : 's'} · {fileCount} current file{fileCount === 1 ? '' : 's'}
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
                {runModeButtonLabel('pipeline_only')}
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
                {runModeButtonLabel('full')}
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
            {fileCount > 0 ? (
              <>
                Ready to transcribe {fileCount} current file{fileCount === 1 ? '' : 's'}. Choose a run mode
                above.
              </>
            ) : (
              <>
                No audio files yet.{' '}
                <Link to="/evaluation/runs" className="admin-link">
                  Manage files on the list page
                </Link>{' '}
                before starting.
              </>
            )}
          </p>
        ) : (detail.attempts?.length ?? 0) === 0 ? (
          <p className="admin-muted">No run history yet.</p>
        ) : (
          detail.attempts.map((attempt, index) => (
            <EvalRunAttemptSection
              key={attempt.id}
              attempt={attempt}
              variants={detail.variants}
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
