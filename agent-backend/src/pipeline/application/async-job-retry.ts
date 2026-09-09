import type { AsyncJobMetrics } from '../../infrastructure/db/index.ts';
import {
  inferFailedFromStage,
  resumeStageForFailedJob,
  type AsyncJobDomain,
} from '../domain/async-job-stages.ts';
import {
  buildFailureMetrics,
  canRetryJob,
  getDefaultRetryPolicy,
  getRetryAttempt,
  mergeAsyncJobMetrics,
  type RetryPolicy,
} from '../domain/async-job-retry-policy.ts';
export {
  buildFailureMetrics,
  canRetryJob,
  getDefaultRetryPolicy,
  getRetryAttempt,
  mergeAsyncJobMetrics,
  resolveAsyncJobPatchMetrics,
  type RetryPolicy,
} from '../domain/async-job-retry-policy.ts';
import { getPipelineJobById, updatePipelineJob } from './pipeline-jobs.ts';
import { getAudioPipelineJobById, updateAudioPipelineJob } from '../../audio/application/audio-pipeline-jobs.ts';
import {
  getDocumentCapturePipelineJobById,
  markDocumentCaptureForJobStage,
  updateDocumentCapturePipelineJob,
} from '../../document/application/document-capture-pipeline-jobs.ts';
import {
  getKbImportJobById,
  updateKbImportJob,
} from '../../kb/application/knowledge-bases.ts';
import { spawnAsyncPipelineWorker } from './pipeline-runner.ts';
import { spawnAsyncAudioPipelineWorker } from '../../audio/infrastructure/audio-pipeline-runner.ts';
import { spawnDocumentCapturePostProcessWorker } from '../../document/application/document-capture-pipeline-runner.ts';
import { spawnKbImportWorker } from '../../kb/infrastructure/kb-import-runner.ts';
import { markDocumentForJobStage } from './pipeline-jobs.ts';
import type { CapturePipelineJobStage } from '../../infrastructure/db/index.ts';
import type { AudioPipelineJobStage } from '../../infrastructure/db/index.ts';
import type { PipelineJobStage } from '../../infrastructure/db/index.ts';
import type { KbImportJobStatus } from '../../infrastructure/db/index.ts';

function isEvalLinkedJob(domain: AsyncJobDomain, job: { evalRunItemId?: string | null }): boolean {
  if (domain === 'document_pipeline' || domain === 'audio_pipeline') {
    return Boolean(job.evalRunItemId?.trim());
  }
  return false;
}

async function spawnWorkerForDomain(domain: AsyncJobDomain, jobId: string): Promise<void> {
  switch (domain) {
    case 'document_pipeline': {
      const job = await getPipelineJobById(jobId);
      if (!job) throw new Error('Pipeline job not found');
      await spawnAsyncPipelineWorker(job.id, job.pipelineName);
      return;
    }
    case 'audio_pipeline': {
      const job = await getAudioPipelineJobById(jobId);
      if (!job) throw new Error('Audio pipeline job not found');
      await spawnAsyncAudioPipelineWorker(job.id, job.pipelineName);
      return;
    }
    case 'capture_pipeline': {
      const job = await getDocumentCapturePipelineJobById(jobId);
      if (!job) throw new Error('Capture pipeline job not found');
      await spawnDocumentCapturePostProcessWorker(job.id, job.pipelineName);
      return;
    }
    case 'kb_import': {
      await spawnKbImportWorker(jobId);
      return;
    }
    default:
      throw new Error(`Unsupported async job domain: ${domain as string}`);
  }
}

async function applyResumeSideEffects(
  domain: AsyncJobDomain,
  jobId: string,
  resumeStage: string,
): Promise<void> {
  switch (domain) {
    case 'document_pipeline': {
      const job = await getPipelineJobById(jobId);
      if (job?.documentId) {
        await markDocumentForJobStage(job.documentId, resumeStage as PipelineJobStage);
      }
      return;
    }
    case 'audio_pipeline': {
      const job = await getAudioPipelineJobById(jobId);
      if (job?.documentCaptureSegmentId) {
        const { markDocumentCaptureSegmentForAudioPipelineJobStage } = await import(
          '../../audio/application/audio-pipeline-jobs.ts'
        );
        await markDocumentCaptureSegmentForAudioPipelineJobStage(
          job.documentCaptureSegmentId,
          resumeStage as AudioPipelineJobStage,
        );
      }
      return;
    }
    case 'capture_pipeline': {
      const job = await getDocumentCapturePipelineJobById(jobId);
      if (job) {
        await markDocumentCaptureForJobStage(
          job.captureId,
          resumeStage as CapturePipelineJobStage,
        );
      }
      return;
    }
    case 'kb_import':
      return;
    default:
      return;
  }
}

export async function retryFailedJob(
  domain: AsyncJobDomain,
  jobId: string,
  policy: RetryPolicy = getDefaultRetryPolicy(),
): Promise<{ retried: boolean; resumeStage?: string; reason?: string }> {
  switch (domain) {
    case 'document_pipeline': {
      const job = await getPipelineJobById(jobId);
      if (!job) return { retried: false, reason: 'job_not_found' };
      if (job.stage !== 'failed') return { retried: false, reason: 'not_failed' };
      if (isEvalLinkedJob(domain, job)) return { retried: false, reason: 'eval_job' };
      if (!canRetryJob(job.metrics, policy)) return { retried: false, reason: 'max_attempts' };

      const failedFrom = inferFailedFromStage(domain, job.stage, job.metrics);
      const resumeStage = resumeStageForFailedJob(domain, failedFrom);
      if (!resumeStage) return { retried: false, reason: 'no_resume_stage' };

      const nextAttempt = getRetryAttempt(job.metrics) + 1;
      await updatePipelineJob(jobId, {
        stage: resumeStage as PipelineJobStage,
        errorMessage: null,
        metrics: mergeAsyncJobMetrics(job.metrics, {
          retry_attempt: nextAttempt,
          max_attempts: policy.maxAttempts,
          failed_from_stage: undefined,
          last_retry_at: new Date().toISOString(),
        }),
      });
      await applyResumeSideEffects(domain, jobId, resumeStage);
      await spawnWorkerForDomain(domain, jobId);
      return { retried: true, resumeStage };
    }
    case 'audio_pipeline': {
      const job = await getAudioPipelineJobById(jobId);
      if (!job) return { retried: false, reason: 'job_not_found' };
      if (job.stage !== 'failed') return { retried: false, reason: 'not_failed' };
      if (isEvalLinkedJob(domain, job)) return { retried: false, reason: 'eval_job' };
      if (!canRetryJob(job.metrics, policy)) return { retried: false, reason: 'max_attempts' };

      const failedFrom = inferFailedFromStage(domain, job.stage, job.metrics);
      const resumeStage = resumeStageForFailedJob(domain, failedFrom);
      if (!resumeStage) return { retried: false, reason: 'no_resume_stage' };

      const nextAttempt = getRetryAttempt(job.metrics) + 1;
      await updateAudioPipelineJob(jobId, {
        stage: resumeStage as AudioPipelineJobStage,
        errorMessage: null,
        metrics: mergeAsyncJobMetrics(job.metrics, {
          retry_attempt: nextAttempt,
          max_attempts: policy.maxAttempts,
          failed_from_stage: undefined,
          last_retry_at: new Date().toISOString(),
        }),
      });
      await applyResumeSideEffects(domain, jobId, resumeStage);
      await spawnWorkerForDomain(domain, jobId);
      return { retried: true, resumeStage };
    }
    case 'capture_pipeline': {
      const job = await getDocumentCapturePipelineJobById(jobId);
      if (!job) return { retried: false, reason: 'job_not_found' };
      if (job.stage !== 'failed') return { retried: false, reason: 'not_failed' };
      if (!canRetryJob(job.metrics, policy)) return { retried: false, reason: 'max_attempts' };

      const failedFrom = inferFailedFromStage(domain, job.stage, job.metrics);
      const resumeStage = resumeStageForFailedJob(domain, failedFrom);
      if (!resumeStage) return { retried: false, reason: 'no_resume_stage' };

      const nextAttempt = getRetryAttempt(job.metrics) + 1;
      await updateDocumentCapturePipelineJob(jobId, {
        stage: resumeStage as CapturePipelineJobStage,
        errorMessage: null,
        metrics: mergeAsyncJobMetrics(job.metrics, {
          retry_attempt: nextAttempt,
          max_attempts: policy.maxAttempts,
          failed_from_stage: undefined,
          last_retry_at: new Date().toISOString(),
        }),
      });
      await applyResumeSideEffects(domain, jobId, resumeStage);
      await spawnWorkerForDomain(domain, jobId);
      return { retried: true, resumeStage };
    }
    case 'kb_import': {
      const job = await getKbImportJobById(jobId);
      if (!job) return { retried: false, reason: 'job_not_found' };
      if (job.status !== 'failed') return { retried: false, reason: 'not_failed' };
      if (!canRetryJob(job.metrics, policy)) return { retried: false, reason: 'max_attempts' };

      const failedFrom = inferFailedFromStage(domain, job.status, job.metrics);
      const resumeStage = resumeStageForFailedJob(domain, failedFrom) ?? 'pending';
      const nextAttempt = getRetryAttempt(job.metrics) + 1;
      await updateKbImportJob(jobId, {
        status: resumeStage as KbImportJobStatus,
        errorMessage: null,
        metrics: mergeAsyncJobMetrics(job.metrics, {
          retry_attempt: nextAttempt,
          max_attempts: policy.maxAttempts,
          failed_from_stage: undefined,
          last_retry_at: new Date().toISOString(),
        }),
      });
      await spawnWorkerForDomain(domain, jobId);
      return { retried: true, resumeStage };
    }
    default:
      return { retried: false, reason: 'unsupported_domain' };
  }
}

export async function maybeAutoRetryAfterFailed(
  domain: AsyncJobDomain,
  jobId: string,
  policy: RetryPolicy = getDefaultRetryPolicy(),
): Promise<{ retried: boolean; resumeStage?: string; reason?: string }> {
  if (!policy.autoRetry) return { retried: false, reason: 'auto_retry_disabled' };
  return retryFailedJob(domain, jobId, policy);
}

export async function prepareFailedJobPatch(input: {
  domain: AsyncJobDomain;
  previousStage: string;
  existingMetrics: AsyncJobMetrics | null | undefined;
  policy?: RetryPolicy;
  errorCode?: string;
  metricsPatch?: Partial<AsyncJobMetrics> | null;
}): Promise<{ metrics: AsyncJobMetrics | null }> {
  const policy = input.policy ?? getDefaultRetryPolicy();
  const failedFromStage = inferFailedFromStage(
    input.domain,
    input.previousStage,
    input.existingMetrics,
  );
  const base = buildFailureMetrics({
    existing: input.existingMetrics,
    failedFromStage: failedFromStage ?? input.previousStage,
    policy,
    errorCode: input.errorCode,
  });
  return {
    metrics: mergeAsyncJobMetrics(base, input.metricsPatch),
  };
}
