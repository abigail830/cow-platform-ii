export const CAPTURE_POST_PROCESS_PIPELINE_NAMES = new Set(['audio-capture-post-process']);

export function isCapturePostProcessPipelineName(pipelineName: string): boolean {
  return CAPTURE_POST_PROCESS_PIPELINE_NAMES.has(pipelineName);
}
