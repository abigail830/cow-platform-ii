import {
  getDefaultModelConfig,
  getModelConfigByName,
  type RuntimeModelConfig,
} from './model-config-store.ts';

export async function resolveSessionFileVisionModel(): Promise<RuntimeModelConfig> {
  const explicit = process.env.SESSION_FILE_VISION_MODEL?.trim();
  if (explicit) {
    const config = await getModelConfigByName(explicit);
    if (!config) {
      throw new Error(`SESSION_FILE_VISION_MODEL not found: "${explicit}"`);
    }
    if (config.apiType !== 'vlm') {
      throw new Error(`SESSION_FILE_VISION_MODEL must be apiType "vlm" (got "${config.apiType}")`);
    }
    return config;
  }

  const defaultVlm = await getDefaultModelConfig('vlm');
  if (!defaultVlm) {
    throw new Error(
      'No default VLM model configured. Set SESSION_FILE_VISION_MODEL or mark a VLM model as default in Model Config.',
    );
  }
  return defaultVlm;
}
