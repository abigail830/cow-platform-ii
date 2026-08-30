import { useSyncExternalStore } from 'react';
import {
  getEvalDatasetUploadJob,
  subscribeEvalDatasetUploadJobs,
  type EvalDatasetUploadJob,
} from './eval-dataset-upload-manager.ts';

export function useEvalDatasetUploadJob(datasetId: string | undefined): EvalDatasetUploadJob | undefined {
  return useSyncExternalStore(
    subscribeEvalDatasetUploadJobs,
    () => (datasetId ? getEvalDatasetUploadJob(datasetId) : undefined),
    () => undefined,
  );
}
