import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, Eye, FolderOpen, Loader2, Pencil, Play, Plus, RotateCw, Scale, Trash2 } from 'lucide-react';
import {
  createEvalRun,
  deleteEvalRun,
  evaluateEvalRunAttempt,
  formatEvalRunPhase,
  formatEvalRunStatus,
  getEvalRunDetail,
  listEvalRunProcessingOptions,
  listEvalRuns,
  retryEvalRunJudge,
  startEvalRun,
  updateEvalRun,
  type EvalRun,
  type EvalRunAttempt,
  type EvalRunDetail,
  type EvalRunDatasetItemRef,
  type EvalRunJudgeRow,
  type EvalRunItem,
  type EvalRunItemStage,
  type EvalRunMode,
  type EvalRunProcessingOption,
  type EvalRunStatus,
} from '../api/evaluation/runs.ts';
import { listEvalDatasets, type EvalDataset } from '../api/evaluation/datasets.ts';
import { EvalRunCreateModal, EvalRunEditModal, EvalRunFilesModal } from '../components/EvalRunModals.tsx';
import { TransientNotice } from '../components/TransientNotice.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { NavPageIcon } from '../components/icons/NavIcons.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { useTransientNotice } from '../hooks/useTransientNotice.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import { fetchPresignedStorageText } from '../api/storage-fetch.ts';
import { extractTranscriptPlainText } from '../shared/transcript-plain-text.ts';

const LIST_PAGE = getNavPage('/evaluation/runs')!;

/** Format judge score for display. New results store raw rubric scale; legacy rows store DeepEval 0–1. */
function formatJudgeScore(
  score: number,
  scoreMax?: number,
  options?: { kind?: string; lowerIsBetter?: boolean },
): string {
  const kind = options?.kind;
  if (kind === 'cer_score' || kind === 'wer_score' || options?.lowerIsBetter) {
    return `${(score * 100).toFixed(1)}%`;
  }
  const max = scoreMax ?? 10;
  const display = scoreMax != null ? score : score * max;
  return `${display.toFixed(1)}/${max}`;
}

/** Compact score for collapsed file summary (e.g. 20.0%｜6.0｜8.0｜9.0). */
function formatJudgeScoreCompact(
  score: number,
  scoreMax?: number,
  options?: { kind?: string; lowerIsBetter?: boolean },
): string {
  const kind = options?.kind;
  if (kind === 'cer_score' || kind === 'wer_score' || options?.lowerIsBetter) {
    return `${(score * 100).toFixed(1)}%`;
  }
  const max = scoreMax ?? 10;
  const display = scoreMax != null ? score : score * max;
  return display.toFixed(1);
}

function buildJudgeScoreSummary(
  job: EvalRunJudgeRow | undefined,
  variants: EvalRunDetail['variants'],
): string | null {
  if (!job?.summary_metrics || job.status !== 'done') return null;

  const variantScores = job.summary_metrics.variant_scores as
    | Record<string, Record<string, JudgeDimensionRow>>
    | undefined;
  if (!variantScores || Object.keys(variantScores).length === 0) return null;

  const variantId =
    variants.find((variant) => variantScores[variant.id])?.id ?? Object.keys(variantScores)[0];
  const dimensions = variantId ? variantScores[variantId] : undefined;
  if (!dimensions) return null;

  const parts = Object.values(dimensions).map((row) => {
    if (typeof row.score !== 'number') return '—';
    return formatJudgeScoreCompact(row.score, row.score_max, {
      kind: row.kind,
      lowerIsBetter: row.lower_is_better,
    });
  });

  return parts.length > 0 ? parts.join('｜') : null;
}

type PipelineDotState = 'complete' | 'active' | 'failed' | 'pending';

function pipelineDotClass(state: PipelineDotState): string {
  if (state === 'complete') return 'pipeline-step-dot complete';
  if (state === 'active') return 'pipeline-step-dot active';
  if (state === 'failed') return 'pipeline-step-dot failed';
  return 'pipeline-step-dot';
}

function pipelineSegmentClass(left: PipelineDotState, right: PipelineDotState): string {
  if (right === 'failed') return 'failed';
  if (left === 'complete') return 'complete';
  if (left === 'failed') return 'failed';
  return 'pending';
}

function resolveFileTranscribeState(
  cells: Array<EvalRunItem | undefined>,
  runStatus: EvalRunStatus,
  starting: boolean,
): PipelineDotState {
  const items = cells.filter((cell): cell is EvalRunItem => cell != null);
  if (items.length === 0) return 'pending';

  if (items.some((item) => item.stage === 'failed' || item.stage === 'cancelled')) return 'failed';
  if (items.every((item) => item.stage === 'done')) return 'complete';
  if (
    starting ||
    items.some((item) => isEvalItemActive(item, runStatus) || isEvalItemQueued(item, runStatus))
  ) {
    return 'active';
  }
  if (items.some((item) => item.stage === 'transcribing' || item.stage === 'submitted')) return 'active';
  return 'pending';
}

function resolveFileCompareState(
  job: EvalRunJudgeRow | undefined,
  isJudgingPhase: boolean,
): PipelineDotState {
  if (job?.status === 'done') return 'complete';
  if (job?.status === 'failed') return 'failed';
  if (job?.status === 'running') return 'active';
  if (job?.status === 'pending' && isJudgingPhase) return 'active';
  if (isJudgingPhase && !job) return 'pending';
  return 'pending';
}

function fileTranscribeDurationLabel(
  variants: EvalRunDetail['variants'],
  itemByVariantAndDataset: Map<string, EvalRunItem>,
  datasetItemId: string,
): string | null {
  let bestMs = -1;
  let label: string | null = null;
  for (const variant of variants) {
    const cell = itemByVariantAndDataset.get(`${variant.id}:${datasetItemId}`);
    const ms =
      cell?.duration_ms ??
      (cell?.metrics && typeof cell.metrics === 'object' && !Array.isArray(cell.metrics)
        ? ((cell.metrics as Record<string, unknown>).asr_duration_ms as number | undefined) ??
          ((cell.metrics as Record<string, unknown>).worker_duration_ms as number | undefined)
        : undefined);
    if (typeof ms === 'number' && ms > bestMs) {
      bestMs = ms;
      label = evalItemTranscribeMetricsLabel(cell);
    }
  }
  return label;
}

function EvalRunFilePipelineStepper({
  transcribeState,
  compareState,
}: {
  transcribeState: PipelineDotState;
  compareState: PipelineDotState | null;
}) {
  const steps =
    compareState == null
      ? [{ key: 'transcribe', label: 'Transcribe', state: transcribeState }]
      : [
          { key: 'transcribe', label: 'Transcribe', state: transcribeState },
          { key: 'compare', label: 'Compare', state: compareState },
        ];
  const lastIndex = steps.length - 1;

  return (
    <div
      className={`document-pipeline-stepper eval-run-file-stepper${steps.length === 1 ? ' is-single' : ''}`}
      aria-label="File pipeline progress"
    >
      {steps.map((step, index) => (
        <div key={step.key} className="pipeline-track-node">
          <div className="pipeline-dot-row">
            <span
              className={`pipeline-step-segment${
                index > 0
                  ? ` ${pipelineSegmentClass(steps[index - 1].state, step.state)}`
                  : ' is-empty'
              }`}
              aria-hidden="true"
            />
            <span className={pipelineDotClass(step.state)} aria-hidden="true" />
            <span
              className={`pipeline-step-segment${
                index < lastIndex
                  ? ` ${pipelineSegmentClass(step.state, steps[index + 1].state)}`
                  : ' is-empty'
              }`}
              aria-hidden="true"
            />
          </div>
          <span className="pipeline-step-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

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

function evalRunFailureMessage(summaryMetrics: Record<string, unknown> | null | undefined): string | null {
  if (!summaryMetrics || typeof summaryMetrics !== 'object') return null;
  const error = summaryMetrics.error;
  return typeof error === 'string' && error.trim() ? error.trim() : null;
}

function canEvaluateAttempt(
  attempt: EvalRunAttempt,
  runStatus: EvalRunStatus,
  starting: boolean,
): boolean {
  if (attempt.run_mode !== 'full') return false;
  if (starting || runStatus === 'running' || attempt.status === 'running') return false;

  const hasTranscript = attempt.items.some(
    (item) => item.stage === 'done' && item.transcript_s3_key,
  );
  if (!hasTranscript) return false;

  return !attempt.items.some((item) => item.stage === 'submitted' || item.stage === 'transcribing');
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

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatRtf(rtf: number): string {
  if (!Number.isFinite(rtf) || rtf < 0) return '';
  return `${rtf.toFixed(2)}×`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

function evalItemTranscribeMetricsLabel(item: EvalRunItem | undefined): string | null {
  const duration = evalItemDurationLabel(item);
  const rtf = item?.rtf;
  if (duration && rtf != null) return `${duration} · RTF ${formatRtf(rtf)}`;
  if (duration) return duration;
  if (rtf != null) return `RTF ${formatRtf(rtf)}`;
  return null;
}

function formatTranscribeSummaryLine(transcribe: unknown): string | null {
  if (!transcribe || typeof transcribe !== 'object' || Array.isArray(transcribe)) return null;
  const byVariant = (transcribe as { by_variant?: Record<string, { display_name?: string; rtf?: number }> })
    .by_variant;
  if (!byVariant) return null;
  const parts = Object.values(byVariant)
    .filter((row) => typeof row.rtf === 'number')
    .map((row) => `${row.display_name ?? 'Variant'} RTF ${formatRtf(row.rtf!)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
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

const GT_JUDGE_SCENARIO_ID = 'asr_pipeline_compare_with_gt';

type JudgeDimensionRow = {
  label?: string;
  kind?: string;
  score?: number;
  score_max?: number;
  lower_is_better?: boolean;
  reason?: string;
  winner?: string | null;
  winner_variant_id?: string | null;
};

function parsePairwiseWinnerFromReason(reason: string): 'a' | 'b' | 'tie' | null {
  const text = reason.trim().toUpperCase();
  if (!text) return null;
  if (/\bTIE\b/.test(text)) return 'tie';
  if (/\bVARIANT A\b|\bTRANSCRIPT A\b|\bINPUT\b|\bA WINS\b|\bWINNER: A\b|\bCHOICE: A\b|\bSELECT A\b/.test(text)) {
    return 'a';
  }
  if (/\bVARIANT B\b|\bTRANSCRIPT B\b|\bACTUAL OUTPUT\b|\bACTUAL\b|\bB WINS\b|\bWINNER: B\b|\bCHOICE: B\b|\bSELECT B\b/.test(text)) {
    return 'b';
  }
  if (/^A[.\s:)/\-—]/.test(text) || /^WINNER:\s*A\b/.test(text)) return 'a';
  if (/^B[.\s:)/\-—]/.test(text) || /^WINNER:\s*B\b/.test(text)) return 'b';
  return null;
}

function resolvePairwiseWinnerLabel(
  row: JudgeDimensionRow,
  variants: EvalRunDetail['variants'],
  variantById: Map<string, string>,
): string | null {
  const normalizedWinner = row.winner?.trim().toLowerCase();
  if (normalizedWinner === 'tie') return 'Tie';
  if (row.winner_variant_id) {
    return variantById.get(row.winner_variant_id) ?? null;
  }
  const winnerKey =
    normalizedWinner === 'a' || normalizedWinner === 'b' || normalizedWinner === 'tie'
      ? normalizedWinner
      : parsePairwiseWinnerFromReason(row.reason ?? '');
  if (winnerKey === 'tie') return 'Tie';
  if (winnerKey === 'a' && variants[0]) {
    return variantById.get(variants[0].id) ?? 'A';
  }
  if (winnerKey === 'b' && variants[1]) {
    return variantById.get(variants[1].id) ?? 'B';
  }

  const reason = row.reason?.trim() ?? '';
  if (reason) {
    const names = variants
      .map((variant) => variant.display_name.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    for (const name of names) {
      if (reason.includes(name)) return name;
    }
  }

  return null;
}

function EvalRunJudgeDimensionTable({
  rows,
}: {
  rows: Array<{ id: string; label: string; value: string; reason: string }>;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="admin-table-wrap eval-run-judge-dimension-table-wrap">
      <table className="admin-table eval-run-judge-dimension-table">
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            <th scope="col">Score</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="eval-run-judge-dimension-table-label">{row.label}</td>
              <td className="eval-run-judge-dimension-table-score">
                <span className="eval-run-judge-dimension-value">{row.value}</span>
              </td>
              <td className="eval-run-judge-dimension-table-reason">
                {row.reason ? (
                  <p className="eval-run-judge-dimension-reason">{row.reason}</p>
                ) : (
                  <span className="admin-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildJudgeDimensionTableRows(
  dimensions: Record<string, JudgeDimensionRow>,
  formatValue: (row: JudgeDimensionRow) => string,
): Array<{ id: string; label: string; value: string; reason: string }> {
  return Object.entries(dimensions).map(([dimensionId, row]) => ({
    id: dimensionId,
    label: row.label ?? dimensionId,
    value: formatValue(row),
    reason: row.reason?.trim() ?? '',
  }));
}

function EvalRunJudgeMultiVariantCompareTable({
  variantScores,
  variantById,
  variantOrder,
}: {
  variantScores: Record<string, Record<string, JudgeDimensionRow>>;
  variantById: Map<string, string>;
  variantOrder: string[];
}) {
  const dimensionIds: string[] = [];
  const dimensionLabels = new Map<string, string>();

  for (const variantId of variantOrder) {
    const dimensions = variantScores[variantId];
    if (!dimensions) continue;
    for (const [dimensionId, row] of Object.entries(dimensions)) {
      if (dimensionIds.includes(dimensionId)) continue;
      dimensionIds.push(dimensionId);
      dimensionLabels.set(dimensionId, row.label ?? dimensionId);
    }
  }

  if (dimensionIds.length === 0) return null;

  function formatVariantValue(row: JudgeDimensionRow | undefined): string {
    if (!row || typeof row.score !== 'number') return '—';
    return formatJudgeScore(row.score, row.score_max, {
      kind: row.kind,
      lowerIsBetter: row.lower_is_better,
    });
  }

  return (
    <div className="admin-table-wrap eval-run-judge-variant-table-wrap">
      <table className="admin-table eval-run-judge-variant-table">
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            {variantOrder.map((variantId) => (
              <th key={variantId} scope="col">
                {variantById.get(variantId) ?? variantId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dimensionIds.map((dimensionId) => (
            <tr key={dimensionId}>
              <td className="eval-run-judge-dimension-table-label">
                {dimensionLabels.get(dimensionId) ?? dimensionId}
              </td>
              {variantOrder.map((variantId) => {
                const row = variantScores[variantId]?.[dimensionId];
                const reason = row?.reason?.trim() ?? '';
                return (
                  <td key={variantId} className="eval-run-judge-variant-table-pipeline">
                    <span className="eval-run-judge-dimension-value">{formatVariantValue(row)}</span>
                    {reason ? (
                      <p className="eval-run-judge-dimension-reason">{reason}</p>
                    ) : (
                      <span className="admin-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvalRunJudgeVariantCompareTable({
  variantScores,
  variantById,
  variantOrder,
}: {
  variantScores: Record<string, Record<string, JudgeDimensionRow>>;
  variantById: Map<string, string>;
  variantOrder: string[];
}) {
  const activeVariantIds = variantOrder.filter((variantId) => variantScores[variantId]);

  if (activeVariantIds.length === 0) return null;

  if (activeVariantIds.length === 1) {
    const variantId = activeVariantIds[0];
    const rows = buildJudgeDimensionTableRows(variantScores[variantId], (row) =>
      typeof row.score === 'number'
        ? formatJudgeScore(row.score, row.score_max, {
            kind: row.kind,
            lowerIsBetter: row.lower_is_better,
          })
        : '—',
    );
    return <EvalRunJudgeDimensionTable rows={rows} />;
  }

  return (
    <EvalRunJudgeMultiVariantCompareTable
      variantScores={variantScores}
      variantById={variantById}
      variantOrder={activeVariantIds}
    />
  );
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
  const variantScores = metrics.variant_scores as Record<string, Record<string, JudgeDimensionRow>> | undefined;
  const pairwise = metrics.pairwise as Record<string, JudgeDimensionRow> | undefined;

  const variantById = new Map(variants.map((variant) => [variant.id, variant.display_name]));

  function formatPairwiseValue(row: JudgeDimensionRow): string {
    const winnerLabel = resolvePairwiseWinnerLabel(row, variants, variantById);
    if (winnerLabel) return winnerLabel;
    if (typeof row.score === 'number') {
      return formatJudgeScore(row.score, row.score_max, {
        kind: row.kind,
        lowerIsBetter: row.lower_is_better,
      });
    }
    return '—';
  }

  const pairwiseRows =
    pairwise && Object.keys(pairwise).length > 0
      ? buildJudgeDimensionTableRows(pairwise, formatPairwiseValue)
      : [];

  return (
    <div className="eval-run-judge-scores">
      {variantScores && Object.keys(variantScores).length > 0 ? (
        <div className="eval-run-judge-section">
          <p className="eval-run-judge-section-title">Per pipeline</p>
          <EvalRunJudgeVariantCompareTable
            variantScores={variantScores}
            variantById={variantById}
            variantOrder={variants.map((variant) => variant.id)}
          />
        </div>
      ) : null}

      {pairwiseRows.length > 0 ? (
        <div className="eval-run-judge-section">
          <p className="eval-run-judge-section-title">Pairwise</p>
          <EvalRunJudgeDimensionTable rows={pairwiseRows} />
        </div>
      ) : null}
    </div>
  );
}

function TranscriptPlainPreview({
  url,
  extractPlain = false,
}: {
  url: string;
  extractPlain?: boolean;
}) {
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
        const raw = text ?? '(empty transcript)';
        setBody(extractPlain ? extractTranscriptPlainText(raw) || raw : raw);
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
  }, [url, extractPlain]);

  if (loadingText) return <p className="admin-muted">Loading transcript…</p>;
  if (error) return <p className="admin-error">{error}</p>;
  return <pre className="asset-market-code eval-run-transcript-preview">{body}</pre>;
}

function TranscriptTextPreview({ text }: { text: string }) {
  const body = text.trim() || '(empty reference)';
  return <pre className="asset-market-code eval-run-transcript-preview">{body}</pre>;
}

function EvalRunTranscriptCompare({
  referenceText,
  actualUrl,
  actualLabel,
  actualError,
}: {
  referenceText: string;
  actualUrl: string | null;
  actualLabel: string;
  actualError?: string | null;
}) {
  return (
    <div className="eval-run-transcript-compare">
      <div className="eval-run-transcript-compare-pane">
        <p className="eval-run-transcript-compare-title">Ground truth</p>
        <div className="eval-run-transcript-compare-body">
          <TranscriptTextPreview text={referenceText} />
        </div>
      </div>
      <div className="eval-run-transcript-compare-pane">
        <p className="eval-run-transcript-compare-title">{actualLabel}</p>
        <div className="eval-run-transcript-compare-body">
          {actualError ? (
            <p className="admin-error eval-run-cell-error">{actualError}</p>
          ) : actualUrl ? (
            <TranscriptPlainPreview url={actualUrl} extractPlain />
          ) : (
            <p className="admin-muted eval-run-transcript-compare-empty">Transcript not ready.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EvalRunFileTranscriptSection({
  datasetItemId,
  datasetItem,
  judgeScenarioId,
  variants,
  itemByVariantAndDataset,
  itemRunStatus,
  itemStarting,
}: {
  datasetItemId: string;
  datasetItem: EvalRunDatasetItemRef | undefined;
  judgeScenarioId?: string;
  variants: EvalRunDetail['variants'];
  itemByVariantAndDataset: Map<string, EvalRunItem>;
  itemRunStatus: EvalRunStatus;
  itemStarting: boolean;
}) {
  const gtScenario = judgeScenarioId === GT_JUDGE_SCENARIO_ID;
  const referenceText = datasetItem?.reference_text?.trim() ?? '';
  const hasReference = referenceText.length > 0;
  const showCompare = hasReference || gtScenario;

  if (showCompare) {
    return (
      <div className="eval-run-transcript-compare-section">
        {!hasReference && gtScenario ? (
          <p className="admin-muted">Ground truth reference not set for this file.</p>
        ) : null}
        {hasReference ? (
          <div className="eval-run-transcript-compare-stack">
            {variants.map((variant) => {
              const cell = itemByVariantAndDataset.get(`${variant.id}:${datasetItemId}`);
              return (
                <EvalRunTranscriptCompare
                  key={variant.id}
                  referenceText={referenceText}
                  actualUrl={cell?.transcript_url ?? null}
                  actualLabel={variant.display_name}
                  actualError={cell?.error_message}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="eval-run-pipeline-grid"
      style={{ ['--pipeline-cols' as string]: String(Math.max(variants.length, 1)) }}
    >
      {variants.map((variant) => {
        const cell = itemByVariantAndDataset.get(`${variant.id}:${datasetItemId}`);
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
  const duration = evalItemTranscribeMetricsLabel(cell);

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
  datasetItemsById,
  runStatus,
  starting,
  defaultOpen,
  canWrite,
  retryingDatasetItemId,
  evaluatingAttemptId,
  onRetryCompare,
  onEvaluate,
  transcribeSummary,
}: {
  attempt: EvalRunAttempt;
  variants: EvalRunDetail['variants'];
  datasetItemsById: Map<string, EvalRunDatasetItemRef>;
  runStatus: EvalRunStatus;
  starting: boolean;
  defaultOpen: boolean;
  canWrite: boolean;
  retryingDatasetItemId: string | null;
  evaluatingAttemptId: string | null;
  onRetryCompare: (datasetItemId: string, attemptId: string) => void;
  onEvaluate: (attemptId: string) => void;
  transcribeSummary?: unknown;
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

  const judgeByDatasetItem = useMemo(() => {
    const map = new Map<string, EvalRunJudgeRow>();
    for (const row of attempt.judge_jobs) {
      map.set(row.dataset_item_id, row);
    }
    return map;
  }, [attempt.judge_jobs]);

  const isJudgingPhase = attempt.phase === 'judging' && attempt.status === 'running';
  const durationLabel = attempt.duration_ms ? formatDurationMs(attempt.duration_ms) : null;
  const transcribeSummaryLabel = formatTranscribeSummaryLine(transcribeSummary);
  const statusBadge = attemptStatusBadge(attempt);
  const showEvaluate =
    canWrite && canEvaluateAttempt(attempt, runStatus, starting);
  const isEvaluating = evaluatingAttemptId === attempt.id;

  return (
    <details className="eval-run-attempt" open={defaultOpen}>
      <summary className="eval-run-attempt-summary">
        <span className="eval-run-attempt-title">
          <NavPageIcon name="evaluation-run" size={16} className="eval-run-attempt-icon" aria-hidden />
          <span className="eval-run-attempt-name">Run #{attempt.attempt_number}</span>
          <span className="eval-run-attempt-time">· {formatDateTime(attempt.started_at)}</span>
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
          {transcribeSummaryLabel ? ` · ${transcribeSummaryLabel}` : ''}
        </span>
        <span className="eval-run-attempt-summary-end">
          {showEvaluate ? (
            <button
              type="button"
              className="btn-secondary eval-run-evaluate-btn"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onEvaluate(attempt.id);
              }}
              disabled={isEvaluating}
            >
              {isEvaluating ? (
                <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
              ) : (
                <Scale {...iconProps()} aria-hidden />
              )}
              Evaluate
            </button>
          ) : null}
          <ChevronDown {...iconProps({ size: 16 })} className="eval-run-attempt-chevron" aria-hidden />
        </span>
      </summary>

      <div className="eval-run-attempt-body">
        {datasetItemRows.length === 0 ? (
          <p className="admin-muted">No files in this run.</p>
        ) : (
          datasetItemRows.map((row) => {
            const itemRunStatus = attempt.status === 'running' ? 'running' : runStatus;
            const itemStarting = starting && attempt.status === 'running';
            const judgeJob = judgeByDatasetItem.get(row.id);
            const datasetItem = datasetItemsById.get(row.id);
            const doneVariantCount = variants.filter(
              (variant) => itemByVariantAndDataset.get(`${variant.id}:${row.id}`)?.stage === 'done',
            ).length;
            const minVariantsForRetry =
              judgeJob?.scenario_id === GT_JUDGE_SCENARIO_ID ? 1 : 2;
            const canRetryCompare =
              canWrite &&
              attempt.run_mode === 'full' &&
              doneVariantCount >= minVariantsForRetry &&
              judgeJob != null &&
              judgeJob.status === 'failed';
            const judgeScoreSummary = buildJudgeScoreSummary(judgeJob, variants);
            const fileCells = variants.map((variant) =>
              itemByVariantAndDataset.get(`${variant.id}:${row.id}`),
            );
            const transcribeState = resolveFileTranscribeState(
              fileCells,
              itemRunStatus,
              itemStarting,
            );
            const compareState =
              attempt.run_mode === 'full' ? resolveFileCompareState(judgeJob, isJudgingPhase) : null;
            const transcribeDuration = fileTranscribeDurationLabel(
              variants,
              itemByVariantAndDataset,
              row.id,
            );

            return (
            <details key={row.id} className="eval-run-file-block">
              <summary className="eval-run-file-summary">
                <span className="eval-run-file-name">{row.name}</span>
                <div className="eval-run-file-summary-stepper">
                  <EvalRunFilePipelineStepper
                    transcribeState={transcribeState}
                    compareState={compareState}
                  />
                </div>
                <span className="eval-run-file-duration admin-muted">
                  {transcribeDuration ?? '—'}
                </span>
                <span className="eval-run-file-scores">
                  {judgeScoreSummary ? (
                    <span className="eval-run-judge-score-summary" title="Dimension scores">
                      {judgeScoreSummary}
                    </span>
                  ) : null}
                </span>
                <span className="eval-run-file-summary-actions">
                  {canRetryCompare ? (
                    <button
                      type="button"
                      className="btn-secondary eval-run-compare-btn eval-run-compare-btn-inline"
                      onClick={(event) => {
                        event.preventDefault();
                        onRetryCompare(row.id, attempt.id);
                      }}
                      disabled={retryingDatasetItemId === row.id}
                      title="Retry compare"
                    >
                      {retryingDatasetItemId === row.id ? (
                        <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                      ) : (
                        <RotateCw {...iconProps()} aria-hidden />
                      )}
                    </button>
                  ) : null}
                </span>
              </summary>

              <div className="eval-run-file-body">
                <EvalRunFileTranscriptSection
                  datasetItemId={row.id}
                  datasetItem={datasetItem}
                  judgeScenarioId={judgeJob?.scenario_id}
                  variants={variants}
                  itemByVariantAndDataset={itemByVariantAndDataset}
                  itemRunStatus={itemRunStatus}
                  itemStarting={itemStarting}
                />

                {attempt.run_mode === 'full' ? (
                  <div className="eval-run-compare-row">
                    {judgeByDatasetItem.get(row.id)?.error_message ? (
                      <p className="admin-error eval-run-cell-error">{judgeByDatasetItem.get(row.id)?.error_message}</p>
                    ) : null}
                    <EvalRunJudgeScores job={judgeByDatasetItem.get(row.id)} variants={variants} />
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
  const [datasets, setDatasets] = useState<EvalDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [filesTarget, setFilesTarget] = useState<EvalRun | null>(null);
  const [editTarget, setEditTarget] = useState<EvalRun | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EvalRun | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [runRows, options, datasetRows] = await Promise.all([
        listEvalRuns(),
        listEvalRunProcessingOptions(),
        listEvalDatasets(),
      ]);
      setRuns(runRows);
      setPipelines(options.transcription_pipelines);
      setDatasets(datasetRows.filter((row) => row.media_type === 'audio'));
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
    datasetId: string;
  }) {
    const created = await createEvalRun({
      name: input.name,
      description: input.description || undefined,
      pipeline_config_ids: input.pipelineConfigIds,
      dataset_id: input.datasetId,
    });
    setModalOpen(false);
    await load();
    navigate(`/evaluation/runs/${created.run.id}`);
  }

  async function handleEditSave(input: { name: string; description: string | null }) {
    if (!editTarget) return;
    await updateEvalRun(editTarget.id, input);
    setEditTarget(null);
    await load();
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
          Compare multiple ASR pipelines on the same dataset. Create a run by selecting an existing dataset,
          then start transcription from the detail page.
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
                    <Link to={`/evaluation/runs/${run.id}`} className="eval-run-list-name">
                      <NavPageIcon name="evaluation-run" size={16} className="eval-run-list-icon" aria-hidden />
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
                        <>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit"
                            onClick={() => setEditTarget(run)}
                          >
                            <Pencil {...iconProps()} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Manage files"
                            onClick={() => setFilesTarget(run)}
                          >
                            <FolderOpen {...iconProps()} aria-hidden />
                          </button>
                        </>
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
          datasets={datasets}
          onCancel={() => setModalOpen(false)}
          onCreate={handleCreate}
        />
      ) : null}

      {editTarget ? (
        <EvalRunEditModal
          run={editTarget}
          onCancel={() => setEditTarget(null)}
          onSave={handleEditSave}
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
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startingMode, setStartingMode] = useState<EvalRunMode | null>(null);
  const [fastPollUntil, setFastPollUntil] = useState<number | null>(null);
  const [retryingCompareItemId, setRetryingCompareItemId] = useState<string | null>(null);
  const [evaluatingAttemptId, setEvaluatingAttemptId] = useState<string | null>(null);
  const { notice, noticeVariant, showNotice } = useTransientNotice(6000);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!runId) return;
    if (!options?.silent) setLoading(true);
    setLoadError('');
    try {
      const detailData = await getEvalRunDetail(runId);
      setDetail(detailData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load run';
      setLoadError(message);
      if (!options?.silent) {
        showNotice(message, 'error');
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
  const runFailureReason = detail ? evalRunFailureMessage(detail.run.summary_metrics) : null;

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

  async function handleRetryCompare(datasetItemId: string, attemptId: string) {
    if (!runId) return;
    setRetryingCompareItemId(datasetItemId);
    try {
      const result = await retryEvalRunJudge(runId, datasetItemId, attemptId);
      setDetail(result);
      setFastPollUntil(Date.now() + 120_000);
      showNotice('Compare retry started', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to retry compare';
      showNotice(message, 'error');
      await load({ silent: true });
    } finally {
      setRetryingCompareItemId(null);
    }
  }

  async function handleEvaluate(attemptId: string) {
    if (!runId) return;
    setEvaluatingAttemptId(attemptId);
    try {
      const result = await evaluateEvalRunAttempt(runId, attemptId);
      setDetail(result);
      setFastPollUntil(Date.now() + 120_000);
      showNotice('Evaluate started', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start evaluate';
      showNotice(message, 'error');
      await load({ silent: true });
    } finally {
      setEvaluatingAttemptId(null);
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
              {(detail.attempts?.length ?? 0) > 0
                ? detail.run.run_mode === 'full'
                  ? ' · Full'
                  : ' · Pipeline only'
                : ''}
              {' · '}
              {detail.variants.length}{' '}
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

      {runFailureReason ? <p className="admin-error">{runFailureReason}</p> : null}

      <div className="eval-run-attempts">
        {loading && !detail ? (
          <p className="admin-muted">Loading…</p>
        ) : loadError && !detail ? (
          <p className="admin-error">{loadError}</p>
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
              datasetItemsById={new Map(detail.dataset_items.map((item) => [item.id, item]))}
              runStatus={displayRunStatus ?? detail.run.status}
              starting={starting}
              defaultOpen={index === 0}
              canWrite={canWrite}
              retryingDatasetItemId={retryingCompareItemId}
              evaluatingAttemptId={evaluatingAttemptId}
              onRetryCompare={(datasetItemId, attemptId) => void handleRetryCompare(datasetItemId, attemptId)}
              onEvaluate={(attemptId) => void handleEvaluate(attemptId)}
              transcribeSummary={index === 0 ? detail.run.summary_metrics?.transcribe : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
