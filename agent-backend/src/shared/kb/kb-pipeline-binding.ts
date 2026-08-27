import {
  getPipelineConfigByPipelineName,
  type PublicPipelineConfig,
} from '../pipeline/pipeline-config-store.ts';
import {
  KB_DEFAULT_PIPELINE_BY_TYPE,
  type KbPipelineUiMeta,
  kbPipelineUiMeta,
} from '../pipeline/pipeline-catalog.ts';
import type { KnowledgeBaseType } from '../../db/index.ts';

export async function resolveDefaultPipelineForKbType(
  type: KnowledgeBaseType,
): Promise<PublicPipelineConfig | null> {
  const pipelineName = KB_DEFAULT_PIPELINE_BY_TYPE[type];
  if (!pipelineName) return null;

  const pipeline = await getPipelineConfigByPipelineName(pipelineName);
  if (!pipeline) {
    throw new Error(`Default knowledge base pipeline not found: ${pipelineName}`);
  }
  if (!pipeline.isEnabled) {
    throw new Error(`Default knowledge base pipeline is disabled: ${pipelineName}`);
  }
  return pipeline;
}

export async function resolveDefaultPipelineIdForKbType(type: KnowledgeBaseType): Promise<string | null> {
  const pipeline = await resolveDefaultPipelineForKbType(type);
  return pipeline?.id ?? null;
}

export function kbPipelineBindingMeta(pipelineName: string): KbPipelineUiMeta | null {
  return kbPipelineUiMeta(pipelineName);
}
