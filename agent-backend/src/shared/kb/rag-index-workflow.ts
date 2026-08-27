/**
 * Resolve RAG index embedding settings from kb-rag-index pipeline Config YAML.
 * YAML is the source of truth; KB embedding_* columns are synced for hybrid-search.
 */
import type { KbChunkConfig } from '../../db/schema.ts';
import { RAG_KB_PIPELINE_NAME } from '../pipeline/pipeline-catalog.ts';
import {
  getPipelineConfigById,
  getPipelineConfigByPipelineName,
  type PublicPipelineConfig,
} from '../pipeline/pipeline-config-store.ts';
import { resolveModelCliParams } from '../../services/models/model-cli-params.ts';
import { parseRagIndexYaml, resolveRagIndexWorkflowYamlText } from './rag-index-yaml.ts';

export type RagIndexEmbedConfig = {
  modelConfigId: string;
  modelName: string;
  dimensions: number;
  chunk: KbChunkConfig;
  configYaml: string | null;
};

export { parseRagIndexYaml, resolveRagIndexWorkflowYamlText } from './rag-index-yaml.ts';

export async function resolveRagIndexEmbedConfig(
  pipeline: PublicPipelineConfig | null | undefined,
): Promise<RagIndexEmbedConfig> {
  const { yaml, source, configYamlSnapshot } = resolveRagIndexWorkflowYamlText(pipeline);
  const parsed = parseRagIndexYaml(yaml, source);
  const params = await resolveModelCliParams({
    modelName: parsed.modelName,
    expectedApiType: 'embeddings',
  });
  return {
    modelConfigId: params.model_id,
    modelName: params.config_name,
    dimensions: parsed.dimensions,
    chunk: parsed.chunk,
    configYaml: configYamlSnapshot,
  };
}

export async function resolveRagIndexEmbedConfigForKb(input: {
  pipelineId?: string | null;
}): Promise<RagIndexEmbedConfig> {
  let pipeline: PublicPipelineConfig | null = null;
  if (input.pipelineId) {
    pipeline = await getPipelineConfigById(input.pipelineId);
  }
  if (!pipeline) {
    pipeline = await getPipelineConfigByPipelineName(RAG_KB_PIPELINE_NAME);
  }
  if (!pipeline || !pipeline.isEnabled) {
    throw new Error('RAG index pipeline is not available');
  }
  return resolveRagIndexEmbedConfig(pipeline);
}
