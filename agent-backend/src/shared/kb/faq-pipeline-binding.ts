/**
 * FAQ KB pipeline binding: which pipelines may be selected for extract vs index.
 */
import {
  FAQ_KB_EXTRACT_PIPELINE_NAME,
  FAQ_KB_INDEX_PIPELINE_NAME,
} from '../pipeline/pipeline-catalog.ts';
import {
  getPipelineConfigById,
  getPipelineConfigByPipelineName,
  listPipelineConfigs,
  type PublicPipelineConfig,
} from '../pipeline/pipeline-config-store.ts';

export type FaqPipelineOption = {
  id: string;
  name: string;
  pipeline_name: string;
  is_system: boolean;
};

function isFaqExtractPipeline(pipeline: PublicPipelineConfig): boolean {
  const name = pipeline.pipelineName.trim();
  const cmd = pipeline.commandTemplate.toLowerCase();
  return name === FAQ_KB_EXTRACT_PIPELINE_NAME || cmd.includes('faq-extract');
}

function isFaqIndexPipeline(pipeline: PublicPipelineConfig): boolean {
  const name = pipeline.pipelineName.trim();
  const cmd = pipeline.commandTemplate.toLowerCase();
  return name === FAQ_KB_INDEX_PIPELINE_NAME || cmd.includes('faq-index');
}

export function pipelineSupportsFaqJobKind(
  pipeline: PublicPipelineConfig,
  jobKind: string | null | undefined,
): boolean {
  if (jobKind === 'faq_extract') return isFaqExtractPipeline(pipeline);
  if (jobKind === 'faq_index') return isFaqIndexPipeline(pipeline);
  if (jobKind === 'rag_index') {
    const name = pipeline.pipelineName.trim();
    const cmd = pipeline.commandTemplate.toLowerCase();
    return name === 'kb-rag-index' || cmd.includes('rag-index');
  }
  return true;
}

function toOption(pipeline: PublicPipelineConfig): FaqPipelineOption {
  return {
    id: pipeline.id,
    name: pipeline.name,
    pipeline_name: pipeline.pipelineName,
    is_system: pipeline.isSystem,
  };
}

export async function listFaqPipelineOptions(): Promise<{
  extract_pipelines: FaqPipelineOption[];
  index_pipelines: FaqPipelineOption[];
  default_extract_pipeline_id: string | null;
  default_index_pipeline_id: string | null;
}> {
  const { pipelines } = await listPipelineConfigs({ enabledOnly: true, limit: 100 });
  const extract = pipelines.filter(isFaqExtractPipeline).map(toOption);
  const index = pipelines.filter(isFaqIndexPipeline).map(toOption);

  const defaultExtract =
    (await getPipelineConfigByPipelineName(FAQ_KB_EXTRACT_PIPELINE_NAME)) ?? null;
  const defaultIndex =
    (await getPipelineConfigByPipelineName(FAQ_KB_INDEX_PIPELINE_NAME)) ?? null;

  return {
    extract_pipelines: extract,
    index_pipelines: index,
    default_extract_pipeline_id: defaultExtract?.isEnabled ? defaultExtract.id : extract[0]?.id ?? null,
    default_index_pipeline_id: defaultIndex?.isEnabled ? defaultIndex.id : index[0]?.id ?? null,
  };
}

/** Resolve extract pipeline: KB override → system default kb-faq-extract. */
export async function resolveFaqExtractPipeline(input: {
  extractPipelineId?: string | null;
}): Promise<PublicPipelineConfig> {
  const overrideId = input.extractPipelineId?.trim() || null;
  if (overrideId) {
    const pipeline = await getPipelineConfigById(overrideId);
    if (!pipeline || !pipeline.isEnabled) {
      throw new Error('Selected FAQ extract pipeline is not available');
    }
    if (!isFaqExtractPipeline(pipeline)) {
      throw new Error(`Pipeline "${pipeline.name}" is not an FAQ extract pipeline`);
    }
    return pipeline;
  }

  const fallback = await getPipelineConfigByPipelineName(FAQ_KB_EXTRACT_PIPELINE_NAME);
  if (!fallback || !fallback.isEnabled) {
    throw new Error('FAQ extract pipeline is not available');
  }
  return fallback;
}

/** Resolve index pipeline: KB.pipeline_id → system default kb-faq-index. */
export async function resolveFaqIndexPipeline(input: {
  pipelineId?: string | null;
}): Promise<PublicPipelineConfig> {
  const overrideId = input.pipelineId?.trim() || null;
  if (overrideId) {
    const pipeline = await getPipelineConfigById(overrideId);
    if (!pipeline || !pipeline.isEnabled) {
      throw new Error('Selected FAQ index pipeline is not available');
    }
    if (!isFaqIndexPipeline(pipeline)) {
      throw new Error(`Pipeline "${pipeline.name}" is not an FAQ index pipeline`);
    }
    return pipeline;
  }

  const fallback = await getPipelineConfigByPipelineName(FAQ_KB_INDEX_PIPELINE_NAME);
  if (!fallback || !fallback.isEnabled) {
    throw new Error('FAQ index pipeline is not available');
  }
  return fallback;
}
