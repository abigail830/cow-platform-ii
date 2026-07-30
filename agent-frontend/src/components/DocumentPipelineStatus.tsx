import type { DocumentPipelineJob, DocumentRecord } from '../api/documents.ts';

const UPLOAD_STEP = { key: 'upload', label: 'Upload' } as const;

const PIPELINE_STEPS = [
  { stage: 'submitted', label: 'Submit' },
  { stage: 'parsed', label: 'Parse' },
  { stage: 'extracted_metadata', label: 'Metadata' },
  { stage: 'done', label: 'Done' },
] as const;

type StepDef = { key: string; label: string };

function pipelineStageProgressIndex(stage: string): number {
  switch (stage) {
    case 'submitted':
      return 0;
    case 'parsed':
      return 1;
    case 'extracted_metadata':
      return 2;
    case 'done':
      return 3;
    default:
      return -1;
  }
}

export function formatDocumentStatusLabel(status: string): string {
  switch (status) {
    case 'uploaded':
      return 'Uploaded';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function formatPipelineStageLabel(stage: string, pipelineName?: string | null): string {
  switch (stage) {
    case 'submitted':
      return 'Submitting to cloud';
    case 'parsed':
      return 'Parsing / finalizing';
    case 'extracted_metadata':
      return 'Extracting metadata';
    case 'done':
      return 'Pipeline complete';
    case 'failed':
      return 'Pipeline failed';
    default:
      return stage;
  }
}

function inferPipelineFailedStepIndex(job: DocumentPipelineJob): number {
  if (!job.external_job_id?.trim()) {
    return 0;
  }

  const message = (job.error_message ?? '').toLowerCase();
  if (message.includes('metadata') || message.includes('extraction')) return 2;
  if (message.includes('finalize') || message.includes('markdown')) return 1;
  if (message.includes('submitdocparser') || message.includes('submit ')) return 0;
  if (message.includes('poll') || message.includes('timed out')) return 0;
  return 1;
}

function buildSteps(document: DocumentRecord): StepDef[] {
  const steps: StepDef[] = [UPLOAD_STEP];
  if (document.pipeline_job) {
    for (const step of PIPELINE_STEPS) {
      steps.push({ key: step.stage, label: step.label });
    }
  }
  return steps;
}

function dotClassForStep(
  index: number,
  document: DocumentRecord,
  job: DocumentPipelineJob | null,
): string {
  let dotClass = 'pipeline-step-dot';

  if (!job) {
    return `${dotClass} complete`;
  }

  if (index === 0) return `${dotClass} complete`;

  const pipelineIndex = index - 1;
  const failed = job.stage === 'failed';
  const failedPipelineIndex = failed ? inferPipelineFailedStepIndex(job) : -1;

  if (failed) {
    if (pipelineIndex < failedPipelineIndex) return `${dotClass} complete`;
    if (pipelineIndex === failedPipelineIndex) return `${dotClass} failed`;
    return `${dotClass} pending`;
  }

  const progress = pipelineStageProgressIndex(job.stage);
  if (progress < 0) return `${dotClass} pending`;

  if (pipelineIndex < progress) return `${dotClass} complete`;
  if (pipelineIndex === progress && document.status === 'running') return `${dotClass} active`;
  if (pipelineIndex <= progress) return `${dotClass} complete`;
  return `${dotClass} pending`;
}

function segmentClassForConnector(
  leftIndex: number,
  document: DocumentRecord,
  job: DocumentPipelineJob | null,
): string {
  const rightDot = dotClassForStep(leftIndex + 1, document, job);
  if (rightDot.includes('failed')) return 'failed';
  const leftDot = dotClassForStep(leftIndex, document, job);
  if (leftDot.includes('complete')) return 'complete';
  return 'pending';
}

function shortenErrorMessage(message: string, maxLen = 120): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

function buildTooltip(document: DocumentRecord, job: DocumentPipelineJob | null): string {
  const parts: string[] = [formatDocumentStatusLabel(document.status)];
  if (job) {
    parts.push(formatPipelineStageLabel(job.stage, job.pipeline_name));
    if (job.error_message) parts.push(job.error_message);
  } else if (document.status === 'running') {
    parts.push('Pipeline in progress');
  }
  return parts.join(' — ');
}

type DocumentPipelineStatusProps = {
  document: DocumentRecord;
};

export function DocumentPipelineStatus({ document }: DocumentPipelineStatusProps) {
  const job = document.pipeline_job;
  const steps = buildSteps(document);
  const lastIndex = steps.length - 1;

  return (
    <div className="document-pipeline-status" title={buildTooltip(document, job)}>
      <div
        className={`document-pipeline-stepper${steps.length === 1 ? ' is-single' : ''}`}
        aria-label="Document progress"
      >
        {steps.map((step, index) => (
          <div key={step.key} className="pipeline-track-node">
            <div className="pipeline-dot-row">
              <span
                className={`pipeline-step-segment${
                  index > 0 ? ` ${segmentClassForConnector(index - 1, document, job)}` : ' is-empty'
                }`}
                aria-hidden="true"
              />
              <span className={dotClassForStep(index, document, job)} aria-hidden="true" />
              <span
                className={`pipeline-step-segment${
                  index < lastIndex ? ` ${segmentClassForConnector(index, document, job)}` : ' is-empty'
                }`}
                aria-hidden="true"
              />
            </div>
            <span className="pipeline-step-label">{step.label}</span>
          </div>
        ))}
      </div>
      {document.status === 'failed' && job?.error_message && (
        <p className="document-pipeline-error" title={job.error_message}>
          {shortenErrorMessage(job.error_message)}
        </p>
      )}
    </div>
  );
}
