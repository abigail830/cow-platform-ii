import {
  formatCaptureStatusLabel,
  isCapturePostProcessFailed,
  type AudioCaptureRecord,
} from '../api/audioCaptures.ts';

const POST_PROCESS_STEPS = [
  { key: 'structuring', label: 'Structure' },
  { key: 'classifying', label: 'Classify' },
  { key: 'extracting', label: 'Extract' },
  { key: 'synthesizing', label: 'Summarize' },
  { key: 'done', label: 'Done' },
] as const;

const ACTIVE_STAGES = new Set(['submitted', 'structuring', 'classifying', 'extracting', 'synthesizing']);

type CaptureJob = NonNullable<AudioCaptureRecord['pipeline_job']>;

function pipelineStageProgressIndex(stage: string): number {
  switch (stage) {
    case 'submitted':
    case 'structuring':
      return 0;
    case 'classifying':
      return 1;
    case 'extracting':
      return 2;
    case 'synthesizing':
      return 3;
    case 'done':
      return 4;
    default:
      return -1;
  }
}

function inferFailedStepIndex(job: CaptureJob): number {
  const message = (job.error_message ?? '').toLowerCase();
  if (message.includes('extract')) return 2;
  if (message.includes('synth') || message.includes('summar')) return 3;
  if (message.includes('classif')) return 1;
  if (message.includes('structur') || message.includes('segment') || message.includes('merge')) return 0;
  if (message.includes('github actions worker failed')) return 2;
  return 0;
}

function shortenErrorMessage(message: string, maxLen = 120): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

function buildTooltip(capture: AudioCaptureRecord, job: CaptureJob | null): string {
  const parts: string[] = [formatCaptureStatusLabel(capture.status)];
  if (job) {
    parts.push(job.stage);
    if (job.error_message) parts.push(job.error_message);
  }
  return parts.join(' — ');
}

function shouldShowPostProcessStepper(capture: AudioCaptureRecord): boolean {
  const job = capture.pipeline_job;
  if (capture.status === 'post_processing') return true;
  if (!job) return false;
  if (job.stage === 'failed') return true;
  return ACTIVE_STAGES.has(job.stage);
}

function dotClassForStep(index: number, job: CaptureJob | null, captureStatus: string): string {
  let dotClass = 'pipeline-step-dot';
  if (!job) {
    return captureStatus === 'post_processing' ? `${dotClass} active` : `${dotClass} pending`;
  }

  const failed = job.stage === 'failed';
  const progress = pipelineStageProgressIndex(job.stage);
  const failedIndex = failed ? (progress >= 0 ? progress : inferFailedStepIndex(job)) : -1;

  if (failed) {
    if (index < failedIndex) return `${dotClass} complete`;
    if (index === failedIndex) return `${dotClass} failed`;
    return `${dotClass} pending`;
  }

  if (progress < 0) return `${dotClass} pending`;
  if (index < progress) return `${dotClass} complete`;
  if (index === progress && job.stage !== 'done') return `${dotClass} active`;
  if (index <= progress) return `${dotClass} complete`;
  return `${dotClass} pending`;
}

function segmentClassForConnector(
  leftIndex: number,
  job: CaptureJob | null,
  captureStatus: string,
): string {
  const rightDot = dotClassForStep(leftIndex + 1, job, captureStatus);
  if (rightDot.includes('failed')) return 'failed';
  const leftDot = dotClassForStep(leftIndex, job, captureStatus);
  if (leftDot.includes('complete')) return 'complete';
  return 'pending';
}

type CapturePipelineStatusProps = {
  capture: AudioCaptureRecord;
  /** stack: error below stepper (table/list). inline: error to the right of stepper (detail header). */
  errorLayout?: 'stack' | 'inline';
};

export function CapturePipelineStatus({
  capture,
  errorLayout = 'stack',
}: CapturePipelineStatusProps) {
  const job = capture.pipeline_job ?? null;
  const failed = isCapturePostProcessFailed(capture);
  const statusLabel = formatCaptureStatusLabel(capture.status);

  if (!shouldShowPostProcessStepper(capture)) {
    return (
      <span className={`document-status-badge ${failed ? 'status-failed' : 'status-completed'}`.trim()} title={statusLabel}>
        {statusLabel}
      </span>
    );
  }

  const steps = POST_PROCESS_STEPS;
  const lastIndex = steps.length - 1;
  const errorMessage = job?.error_message?.trim() ?? '';

  return (
    <div
      className={`document-pipeline-status capture-pipeline-status${
        errorLayout === 'inline' ? ' capture-pipeline-status--inline-error' : ''
      }`.trim()}
      title={buildTooltip(capture, job)}
    >
      <div
        className="document-pipeline-stepper capture-post-process-stepper"
        aria-label={`Capture post-process: ${statusLabel}`}
      >
        {steps.map((step, index) => (
          <div key={step.key} className="pipeline-track-node">
            <div className="pipeline-dot-row">
              <span
                className={`pipeline-step-segment${
                  index > 0 ? ` ${segmentClassForConnector(index - 1, job, capture.status)}` : ' is-empty'
                }`}
                aria-hidden="true"
              />
              <span className={dotClassForStep(index, job, capture.status)} aria-hidden="true" />
              <span
                className={`pipeline-step-segment${
                  index < lastIndex ? ` ${segmentClassForConnector(index, job, capture.status)}` : ' is-empty'
                }`}
                aria-hidden="true"
              />
            </div>
            <span className="pipeline-step-label">{step.label}</span>
          </div>
        ))}
      </div>
      {failed && errorMessage ? (
        <p className="document-pipeline-error" title={errorMessage}>
          {shortenErrorMessage(errorMessage)}
        </p>
      ) : null}
    </div>
  );
}
