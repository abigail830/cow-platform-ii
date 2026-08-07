import type { AudioRecord } from '../api/audios.ts';
import { resolveEffectiveAudioStatus } from '../api/audios.ts';
import { formatDocumentStatusLabel } from './DocumentPipelineStatus.tsx';

const UPLOAD_STEP = { key: 'upload', label: 'Upload' } as const;

const PIPELINE_STEPS = [
  { stage: 'submitted', label: 'Submit' },
  { stage: 'transcribing', label: 'Transcribe' },
  { stage: 'done', label: 'Done' },
] as const;

type StepDef = { key: string; label: string };

function pipelineStageProgressIndex(stage: string): number {
  switch (stage) {
    case 'submitted':
      return 0;
    case 'transcribing':
      return 1;
    case 'done':
      return 2;
    default:
      return -1;
  }
}

function inferFailedStepIndex(job: NonNullable<AudioRecord['pipeline_job']>): number {
  const message = (job.error_message ?? '').toLowerCase();
  if (message.includes('transcri') || message.includes('asr') || message.includes('poll')) return 1;
  if (message.includes('submit') || message.includes('external_job_id')) return 0;
  if (job.external_job_id?.trim()) return 1;
  return 0;
}

function buildSteps(audio: AudioRecord): StepDef[] {
  const steps: StepDef[] = [UPLOAD_STEP];
  if (audio.pipeline_job) {
    for (const step of PIPELINE_STEPS) {
      steps.push({ key: step.stage, label: step.label });
    }
  }
  return steps;
}

function dotClassForStep(
  index: number,
  audio: AudioRecord,
  job: AudioRecord['pipeline_job'],
): string {
  let dotClass = 'pipeline-step-dot';
  if (!job) return `${dotClass} complete`;

  if (index === 0) return `${dotClass} complete`;

  const pipelineIndex = index - 1;
  const failed = job.stage === 'failed';
  const failedPipelineIndex = failed ? inferFailedStepIndex(job) : -1;

  if (failed) {
    if (pipelineIndex < failedPipelineIndex) return `${dotClass} complete`;
    if (pipelineIndex === failedPipelineIndex) return `${dotClass} failed`;
    return `${dotClass} pending`;
  }

  const progress = pipelineStageProgressIndex(job.stage);
  if (progress < 0) return `${dotClass} pending`;

  const status = resolveEffectiveAudioStatus(audio);
  if (pipelineIndex < progress) return `${dotClass} complete`;
  if (pipelineIndex === progress && status === 'running') return `${dotClass} active`;
  if (pipelineIndex <= progress) return `${dotClass} complete`;
  return `${dotClass} pending`;
}

function segmentClassForConnector(
  leftIndex: number,
  audio: AudioRecord,
  job: AudioRecord['pipeline_job'],
): string {
  const rightDot = dotClassForStep(leftIndex + 1, audio, job);
  if (rightDot.includes('failed')) return 'failed';
  const leftDot = dotClassForStep(leftIndex, audio, job);
  if (leftDot.includes('complete')) return 'complete';
  return 'pending';
}

function shortenErrorMessage(message: string, maxLen = 120): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

function buildTooltip(audio: AudioRecord, job: AudioRecord['pipeline_job']): string {
  const status = resolveEffectiveAudioStatus(audio);
  const parts: string[] = [formatDocumentStatusLabel(status)];
  if (job) {
    parts.push(job.stage);
    if (job.error_message) parts.push(job.error_message);
  } else if (status === 'running') {
    parts.push('Transcription in progress');
  }
  return parts.join(' — ');
}

type AudioPipelineStatusProps = {
  audio: AudioRecord;
};

export function AudioPipelineStatus({ audio }: AudioPipelineStatusProps) {
  const job = audio.pipeline_job;
  const steps = buildSteps(audio);
  const lastIndex = steps.length - 1;
  const status = resolveEffectiveAudioStatus(audio);

  return (
    <div className="document-pipeline-status" title={buildTooltip(audio, job)}>
      <div
        className={`document-pipeline-stepper${steps.length === 1 ? ' is-single' : ''}`}
        aria-label="Audio transcription progress"
      >
        {steps.map((step, index) => (
          <div key={step.key} className="pipeline-track-node">
            <div className="pipeline-dot-row">
              <span
                className={`pipeline-step-segment${
                  index > 0 ? ` ${segmentClassForConnector(index - 1, audio, job)}` : ' is-empty'
                }`}
                aria-hidden="true"
              />
              <span className={dotClassForStep(index, audio, job)} aria-hidden="true" />
              <span
                className={`pipeline-step-segment${
                  index < lastIndex ? ` ${segmentClassForConnector(index, audio, job)}` : ' is-empty'
                }`}
                aria-hidden="true"
              />
            </div>
            <span className="pipeline-step-label">{step.label}</span>
          </div>
        ))}
      </div>
      {status === 'failed' && job?.error_message && (
        <p className="document-pipeline-error" title={job.error_message}>
          {shortenErrorMessage(job.error_message)}
        </p>
      )}
    </div>
  );
}
