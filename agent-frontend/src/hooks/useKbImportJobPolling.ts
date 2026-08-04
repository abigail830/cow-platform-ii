import { useCallback, useEffect, useRef } from 'react';
import { getKbImportJob, type KbImportJob } from '../api/knowledgeBases.ts';

export const KB_IMPORT_JOB_POLL_INTERVAL_MS = 3000;

export function isKbImportJobActive(job: KbImportJob | null): boolean {
  return job !== null && job.status !== 'completed' && job.status !== 'failed';
}

type UseKbImportJobPollingOptions = {
  knowledgeBaseId: string | undefined;
  activeJob: KbImportJob | null;
  setActiveJob: (job: KbImportJob | null) => void;
  /** Poll list data while any row still shows in-progress status (covers reload / untracked jobs). */
  listInProgress: boolean;
  onRefresh: () => void | Promise<void>;
  /** Called when a tracked job transitions to completed or failed. */
  onJobTerminal?: (job: KbImportJob) => void | Promise<void>;
  /** Optional extra refresh after each job poll (e.g. selected item detail). */
  onAfterJobPoll?: () => void | Promise<void>;
};

/**
 * Shared polling for KB async import/index jobs (PageIndex, RAG, FAQ).
 * - While activeJob is pending/running: poll job status + refresh list every 3s.
 * - Polls immediately when a job becomes active, and when the tab becomes visible again.
 * - When activeJob completes/fails: refresh list once and invoke onJobTerminal.
 */
export function useKbImportJobPolling(options: UseKbImportJobPollingOptions): void {
  const {
    knowledgeBaseId,
    activeJob,
    setActiveJob,
    listInProgress,
    onRefresh,
    onJobTerminal,
    onAfterJobPoll,
  } = options;

  const activeJobRef = useRef(activeJob);
  activeJobRef.current = activeJob;

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const onAfterJobPollRef = useRef(onAfterJobPoll);
  onAfterJobPollRef.current = onAfterJobPoll;

  const onJobTerminalRef = useRef(onJobTerminal);
  onJobTerminalRef.current = onJobTerminal;

  const pollActiveJob = useCallback(async () => {
    const currentJob = activeJobRef.current;
    if (!knowledgeBaseId || !currentJob || !isKbImportJobActive(currentJob)) return;

    try {
      const job = await getKbImportJob(knowledgeBaseId, currentJob.id);
      const wasActive = isKbImportJobActive(currentJob);
      setActiveJob(job);
      await onRefreshRef.current();
      if (onAfterJobPollRef.current) {
        await onAfterJobPollRef.current();
      }
      if (wasActive && !isKbImportJobActive(job) && onJobTerminalRef.current) {
        await onJobTerminalRef.current(job);
      }
    } catch {
      /* ignore poll errors */
    }
  }, [knowledgeBaseId, setActiveJob]);

  const pollActiveJobRef = useRef(pollActiveJob);
  pollActiveJobRef.current = pollActiveJob;

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'completed' || activeJob.status === 'failed') {
      void onRefreshRef.current();
    }
  }, [activeJob?.id, activeJob?.status]);

  useEffect(() => {
    if (!knowledgeBaseId || !isKbImportJobActive(activeJob)) return;

    void pollActiveJobRef.current();

    const intervalId = window.setInterval(() => {
      void pollActiveJobRef.current();
    }, KB_IMPORT_JOB_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [knowledgeBaseId, activeJob?.id, activeJob?.status]);

  useEffect(() => {
    if (!knowledgeBaseId || !isKbImportJobActive(activeJob)) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void pollActiveJobRef.current();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [knowledgeBaseId, activeJob?.id, activeJob?.status]);

  useEffect(() => {
    if (!knowledgeBaseId || !listInProgress) return;
    if (isKbImportJobActive(activeJob)) return;

    const intervalId = window.setInterval(() => {
      void onRefreshRef.current();
    }, KB_IMPORT_JOB_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [knowledgeBaseId, listInProgress, activeJob?.id, activeJob?.status]);
}
