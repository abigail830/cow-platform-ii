import { useEffect, useRef } from 'react';
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
  /** Optional extra refresh after each job poll (e.g. selected item detail). */
  onAfterJobPoll?: () => void | Promise<void>;
};

/**
 * Shared polling for KB async import/index jobs (PageIndex, RAG, FAQ).
 * - While activeJob is pending/running: poll job status + refresh list every 3s.
 * - While list rows are in-progress without an active job: refresh list every 3s.
 * - When activeJob completes/fails: refresh list once.
 */
export function useKbImportJobPolling(options: UseKbImportJobPollingOptions): void {
  const {
    knowledgeBaseId,
    activeJob,
    setActiveJob,
    listInProgress,
    onRefresh,
    onAfterJobPoll,
  } = options;

  const activeJobRef = useRef(activeJob);
  activeJobRef.current = activeJob;

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const onAfterJobPollRef = useRef(onAfterJobPoll);
  onAfterJobPollRef.current = onAfterJobPoll;

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'completed' || activeJob.status === 'failed') {
      void onRefreshRef.current();
    }
  }, [activeJob?.id, activeJob?.status]);

  useEffect(() => {
    if (!knowledgeBaseId || !isKbImportJobActive(activeJob)) return;

    const intervalId = window.setInterval(() => {
      void (async () => {
        const currentJob = activeJobRef.current;
        if (!currentJob || !isKbImportJobActive(currentJob)) return;
        try {
          const job = await getKbImportJob(knowledgeBaseId, currentJob.id);
          setActiveJob(job);
          await onRefreshRef.current();
          if (onAfterJobPollRef.current) {
            await onAfterJobPollRef.current();
          }
        } catch {
          /* ignore poll errors */
        }
      })();
    }, KB_IMPORT_JOB_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [knowledgeBaseId, activeJob?.id, activeJob?.status, setActiveJob]);

  useEffect(() => {
    if (!knowledgeBaseId || !listInProgress) return;
    if (isKbImportJobActive(activeJob)) return;

    const intervalId = window.setInterval(() => {
      void onRefreshRef.current();
    }, KB_IMPORT_JOB_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [knowledgeBaseId, listInProgress, activeJob?.id, activeJob?.status]);
}
