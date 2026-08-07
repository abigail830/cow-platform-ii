export const ASYNC_AUDIO_PIPELINE_NAMES = new Set(['aliyun-qwen-audio-transcribe']);

export function isAudioAsyncPipelineName(pipelineName: string): boolean {
  return ASYNC_AUDIO_PIPELINE_NAMES.has(pipelineName);
}

export function audioPipelineProviderForName(pipelineName: string): 'aliyun' | null {
  if (pipelineName === 'aliyun-qwen-audio-transcribe') return 'aliyun';
  return null;
}
