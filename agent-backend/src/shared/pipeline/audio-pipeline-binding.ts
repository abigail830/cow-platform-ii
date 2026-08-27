import {
  getPipelineConfigByPipelineName,
  type PublicPipelineConfig,
} from './pipeline-config-store.ts';
import { DEFAULT_AUDIO_TRANSCRIPTION_PIPELINE_NAME } from '../../services/audio/audio-pipeline-names.ts';

export async function resolveDefaultAudioTranscriptionPipeline(): Promise<PublicPipelineConfig | null> {
  const pipeline = await getPipelineConfigByPipelineName(DEFAULT_AUDIO_TRANSCRIPTION_PIPELINE_NAME);
  if (!pipeline) {
    throw new Error(
      `Default audio transcription pipeline not found: ${DEFAULT_AUDIO_TRANSCRIPTION_PIPELINE_NAME}`,
    );
  }
  if (!pipeline.isEnabled) {
    throw new Error(
      `Default audio transcription pipeline is disabled: ${DEFAULT_AUDIO_TRANSCRIPTION_PIPELINE_NAME}`,
    );
  }
  return pipeline;
}

export async function resolveDefaultAudioTranscriptionPipelineId(): Promise<string | null> {
  const pipeline = await resolveDefaultAudioTranscriptionPipeline();
  return pipeline?.id ?? null;
}
