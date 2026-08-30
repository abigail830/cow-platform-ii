import { uploadEvalDatasetItem } from '../api/evaluation/datasets.ts';

export type EvalDatasetUploadJob = {
  datasetId: string;
  total: number;
  completed: number;
  failed: number;
  inProgress: boolean;
};

const jobs = new Map<string, EvalDatasetUploadJob>();
const queues = new Map<string, File[]>();
const queueCallbacks = new Map<string, UploadCallbacks[]>();
const draining = new Set<string>();

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeEvalDatasetUploadJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEvalDatasetUploadJob(datasetId: string): EvalDatasetUploadJob | undefined {
  return jobs.get(datasetId);
}

type UploadCallbacks = {
  onFileUploaded?: () => void;
  onComplete?: (job: EvalDatasetUploadJob) => void;
  onError?: (error: unknown) => void;
};

function ensureJob(datasetId: string): EvalDatasetUploadJob {
  const existing = jobs.get(datasetId);
  if (existing) return existing;
  const job: EvalDatasetUploadJob = {
    datasetId,
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: false,
  };
  jobs.set(datasetId, job);
  return job;
}

async function drainUploadQueue(datasetId: string): Promise<void> {
  if (draining.has(datasetId)) return;
  draining.add(datasetId);

  try {
    while (true) {
      const queue = queues.get(datasetId) ?? [];
      if (queue.length === 0) {
        const job = jobs.get(datasetId);
        if (job) {
          job.inProgress = false;
          notify();
          const callbacks = queueCallbacks.get(datasetId) ?? [];
          queueCallbacks.delete(datasetId);
          for (const cb of callbacks) {
            cb.onComplete?.(job);
          }
        }
        break;
      }

      const file = queue.shift()!;
      queues.set(datasetId, queue);
      const job = ensureJob(datasetId);
      job.inProgress = true;

      try {
        await uploadEvalDatasetItem(datasetId, file);
        job.completed += 1;
      } catch (error) {
        job.failed += 1;
        for (const cb of queueCallbacks.get(datasetId) ?? []) {
          cb.onError?.(error);
        }
      }

      notify();
      for (const cb of queueCallbacks.get(datasetId) ?? []) {
        cb.onFileUploaded?.();
      }
    }
  } finally {
    draining.delete(datasetId);
  }
}

export function startEvalDatasetUpload(
  datasetId: string,
  files: File[],
  callbacks: UploadCallbacks = {},
): void {
  if (files.length === 0) return;

  const job = ensureJob(datasetId);
  job.total += files.length;
  job.inProgress = true;

  const queue = queues.get(datasetId) ?? [];
  queues.set(datasetId, [...queue, ...files]);

  const callbacksList = queueCallbacks.get(datasetId) ?? [];
  callbacksList.push(callbacks);
  queueCallbacks.set(datasetId, callbacksList);

  notify();
  void drainUploadQueue(datasetId);
}
