import {
  getLatestAudioPipelineJobsForAudios,
  markAudioForJobStage,
  updateAudioPipelineJob,
} from './audio-pipeline-jobs.ts';
import {
  defaultAudioSubmitStaleMs,
  defaultAudioTranscribeStaleMs,
  shouldFailStaleAudioJob,
} from './audio-pipeline-stale.ts';

export async function reconcileStaleAudioPipelineJobs(audioIds: string[]): Promise<number> {
  if (audioIds.length === 0) return 0;

  const jobMap = await getLatestAudioPipelineJobsForAudios(audioIds);
  const submitStaleMs = defaultAudioSubmitStaleMs();
  const transcribeStaleMs = defaultAudioTranscribeStaleMs();
  const now = Date.now();
  let reconciled = 0;

  for (const audioId of audioIds) {
    const job = jobMap.get(audioId);
    if (!job) continue;

    const decision = shouldFailStaleAudioJob({
      stage: job.stage,
      externalJobId: job.externalJobId,
      updatedAt: job.updatedAt,
      createdAt: job.createdAt,
      now,
      submitStaleMs,
      transcribeStaleMs,
    });
    if (!decision.stale || !decision.message) continue;

    await updateAudioPipelineJob(job.id, {
      stage: 'failed',
      errorMessage: decision.message,
    });
    await markAudioForJobStage(audioId, 'failed');
    reconciled += 1;
  }

  return reconciled;
}
