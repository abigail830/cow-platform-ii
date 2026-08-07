export const ASYNC_AUDIO_PIPELINE_NAMES = new Set(['aliyun-qwen-audio-transcribe']);

export const DEFAULT_AUDIO_TRANSCRIBE_WORKFLOW_FILE = 'openkms-audio-transcribe.yml';

export function isAudioAsyncPipelineName(pipelineName: string): boolean {
  return ASYNC_AUDIO_PIPELINE_NAMES.has(pipelineName);
}

export function defaultAudioPipelineWorkflowFile(_pipelineName: string): string {
  return DEFAULT_AUDIO_TRANSCRIBE_WORKFLOW_FILE;
}

export function audioPipelineProviderForName(pipelineName: string): 'aliyun' | null {
  if (pipelineName === 'aliyun-qwen-audio-transcribe') return 'aliyun';
  return null;
}
