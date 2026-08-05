/**
 * RAG KB pipeline binding: which pipelines may be selected for indexing.
 */
import { RAG_KB_PIPELINE_NAME } from './pipeline-catalog.ts';
import {
  getPipelineConfigById,
  getPipelineConfigByPipelineName,
  listPipelineConfigs,
  type PublicPipelineConfig,
} from './pipeline-config-store.ts';
import type { FaqPipelineOption } from './faq-pipeline-binding.ts';

export function isRagIndexPipeline(pipeline: PublicPipelineConfig): boolean {
  const name = pipeline.pipelineName.trim();
  const cmd = pipeline.commandTemplate.toLowerCase();
  return name === RAG_KB_PIPELINE_NAME || cmd.includes('rag-index');
}

function toOption(pipeline: PublicPipelineConfig): FaqPipelineOption {
  return {
    id: pipeline.id,
    name: pipeline.name,
    pipeline_name: pipeline.pipelineName,
    is_system: pipeline.isSystem,
  };
}

export async function listRagPipelineOptions(): Promise<{
  index_pipelines: FaqPipelineOption[];
  default_index_pipeline_id: string | null;
}> {
  const { pipelines } = await listPipelineConfigs({ enabledOnly: true, limit: 100 });
  const index = pipelines.filter(isRagIndexPipeline).map(toOption);
  const defaultIndex = await getPipelineConfigByPipelineName(RAG_KB_PIPELINE_NAME);
  return {
    index_pipelines: index,
    default_index_pipeline_id: defaultIndex?.isEnabled ? defaultIndex.id : index[0]?.id ?? null,
  };
}

export async function resolveRagIndexPipeline(input: {
  pipelineId?: string | null;
}): Promise<PublicPipelineConfig> {
  const overrideId = input.pipelineId?.trim() || null;
  if (overrideId) {
    const pipeline = await getPipelineConfigById(overrideId);
    if (!pipeline || !pipeline.isEnabled) {
      throw new Error('Selected RAG index pipeline is not available');
    }
    if (!isRagIndexPipeline(pipeline)) {
      throw new Error(`Pipeline "${pipeline.name}" is not a RAG index pipeline`);
    }
    return pipeline;
  }

  const fallback = await getPipelineConfigByPipelineName(RAG_KB_PIPELINE_NAME);
  if (!fallback || !fallback.isEnabled) {
    throw new Error('RAG index pipeline is not available');
  }
  return fallback;
}
