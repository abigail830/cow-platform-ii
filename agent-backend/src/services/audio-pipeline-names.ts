export const ASYNC_AUDIO_PIPELINE_NAMES = new Set([
  'aliyun-qwen-audio-transcribe',
  'aliyun-fun-asr-transcribe',
]);

/** Default transcription pipeline for new audio channels (root-level, no parent). */
export const DEFAULT_AUDIO_TRANSCRIPTION_PIPELINE_NAME = 'aliyun-fun-asr-transcribe';

export const DEFAULT_AUDIO_TRANSCRIBE_WORKFLOW_FILE = 'openkms-audio-transcribe.yml';

export function isAudioAsyncPipelineName(pipelineName: string): boolean {
  return ASYNC_AUDIO_PIPELINE_NAMES.has(pipelineName);
}

export function defaultAudioPipelineWorkflowFile(_pipelineName: string): string {
  return DEFAULT_AUDIO_TRANSCRIBE_WORKFLOW_FILE;
}

export function audioPipelineProviderForName(pipelineName: string): 'aliyun' | null {
  if (
    pipelineName === 'aliyun-qwen-audio-transcribe' ||
    pipelineName === 'aliyun-fun-asr-transcribe'
  ) {
    return 'aliyun';
  }
  return null;
}
