import { getPipelineConfigByPipelineName } from '../../pipeline/infrastructure/pipeline-config-store.ts';

/** Align with agent-frontend documentChannels.ts and Channel Settings UI. */
export const DEFAULT_KNOWLEDGE_DOCUMENT_PIPELINE_NAME = 'aliyun-docmind-parse';
export const DEFAULT_KNOWLEDGE_TRANSCRIPTION_PIPELINE_NAME = 'aliyun-qwen-audio-transcribe';
export const DEFAULT_KNOWLEDGE_POST_PROCESS_PIPELINE_NAME = 'audio-capture-post-process';

export type KnowledgeChannelPipelineDefaults = {
  documentPipelineId: string | null;
  transcriptionPipelineId: string | null;
  postProcessPipelineId: string | null;
};

export async function getDefaultKnowledgeChannelPipelineIds(): Promise<KnowledgeChannelPipelineDefaults> {
  const [document, transcription, postProcess] = await Promise.all([
    getPipelineConfigByPipelineName(DEFAULT_KNOWLEDGE_DOCUMENT_PIPELINE_NAME),
    getPipelineConfigByPipelineName(DEFAULT_KNOWLEDGE_TRANSCRIPTION_PIPELINE_NAME),
    getPipelineConfigByPipelineName(DEFAULT_KNOWLEDGE_POST_PROCESS_PIPELINE_NAME),
  ]);

  return {
    documentPipelineId: document?.isEnabled ? document.id : null,
    transcriptionPipelineId: transcription?.isEnabled ? transcription.id : null,
    postProcessPipelineId: postProcess?.isEnabled ? postProcess.id : null,
  };
}
