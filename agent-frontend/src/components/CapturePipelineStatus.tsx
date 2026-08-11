import {
  captureStatusBadgeClass,
  formatCaptureStatusLabel,
  type AudioCaptureRecord,
} from '../api/audioCaptures.ts';

const POST_PROCESS_STEPS = [
  { key: 'structuring', label: 'Structure' },
  { key: 'classifying', label: 'Classify' },
  { key: 'extracting', label: 'Extract' },
  { key: 'done', label: 'Done' },
] as const;

const ACTIVE_STAGES = new Set(['submitted', 'structuring', 'classifying', 'extracting']);

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
    case 'done':
      return 3;
    default:
      return -1;
  }
}

function dotClassForStep(index: number, job: CaptureJob | null, captureStatus: string): string {
  let dotClass = 'pipeline-step-dot';
  if (!job) {
    return captureStatus === 'post_processing' ? `${dotClass} active` : `${dotClass} pending`;
  }

  const failed = job.stage === 'failed';
  const progress = pipelineStageProgressIndex(job.stage);

  if (failed) {
    const failedIndex = progress >= 0 ? progress : 0;
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
};

export function CapturePipelineStatus({ capture }: CapturePipelineStatusProps) {
  const job = capture.pipeline_job;
  const statusLabel = formatCaptureStatusLabel(capture.status);
  const badgeClass = captureStatusBadgeClass(capture.status);

  const showPostProcessProgress =
    capture.status === 'post_processing' ||
    (job != null &&
      job.stage !== 'done' &&
      job.stage !== 'failed' &&
      ACTIVE_STAGES.has(job.stage));

  if (showPostProcessProgress) {
    const steps = POST_PROCESS_STEPS;
    const lastIndex = steps.length - 1;

    return (
      <div className="document-pipeline-status capture-pipeline-status" title={statusLabel}>
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
        {job?.stage === 'failed' && job.error_message ? (
          <p className="document-pipeline-error" title={job.error_message}>
            {job.error_message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <span className={`document-status-badge ${badgeClass}`.trim()} title={statusLabel}>
      {statusLabel}
    </span>
  );
}
