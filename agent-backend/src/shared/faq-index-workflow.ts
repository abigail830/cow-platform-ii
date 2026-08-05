/**
 * Resolve FAQ index embedding settings from kb-faq-index pipeline Config YAML.
 * YAML is the source of truth; KB row is synced for hybrid-search query-time resolve.
 */
import { FAQ_KB_INDEX_PIPELINE_NAME } from './pipeline-catalog.ts';
import {
  getPipelineConfigById,
  getPipelineConfigByPipelineName,
  type PublicPipelineConfig,
} from './pipeline-config-store.ts';
import { resolveModelCliParams } from '../services/model-cli-params.ts';
import { parseFaqIndexYaml, resolveFaqIndexWorkflowYamlText } from './faq-index-yaml.ts';

export type FaqIndexEmbedConfig = {
  modelConfigId: string;
  modelName: string;
  dimensions: number;
  configYaml: string | null;
};

export { parseFaqIndexYaml, resolveFaqIndexWorkflowYamlText } from './faq-index-yaml.ts';

export async function resolveFaqIndexEmbedConfig(
  pipeline: PublicPipelineConfig | null | undefined,
): Promise<FaqIndexEmbedConfig> {
  const { yaml, source, configYamlSnapshot } = resolveFaqIndexWorkflowYamlText(pipeline);
  const { modelName, dimensions } = parseFaqIndexYaml(yaml, source);
  const params = await resolveModelCliParams({
    modelName,
    expectedApiType: 'embeddings',
  });
  return {
    modelConfigId: params.model_id,
    modelName: params.config_name,
    dimensions,
    configYaml: configYamlSnapshot,
  };
}

export async function resolveFaqIndexEmbedConfigForKb(input: {
  pipelineId?: string | null;
}): Promise<FaqIndexEmbedConfig> {
  let pipeline: PublicPipelineConfig | null = null;
  if (input.pipelineId) {
    pipeline = await getPipelineConfigById(input.pipelineId);
  }
  if (!pipeline || pipeline.pipelineName !== FAQ_KB_INDEX_PIPELINE_NAME) {
    pipeline = await getPipelineConfigByPipelineName(FAQ_KB_INDEX_PIPELINE_NAME);
  }
  if (!pipeline || !pipeline.isEnabled) {
    throw new Error('FAQ index pipeline is not available');
  }
  return resolveFaqIndexEmbedConfig(pipeline);
}
