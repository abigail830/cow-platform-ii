/**
 * Pure FAQ index workflow YAML helpers (no DB).
 */
import { parse as parseYaml } from 'yaml';
import { readCliPackagedDefaultConfigYaml } from './cli-workflow-defaults.ts';
import { FAQ_KB_INDEX_PIPELINE_NAME } from './pipeline-catalog.ts';

export function parseFaqIndexYaml(
  raw: string,
  source: string,
): { modelName: string; dimensions: number } {
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML';
    throw new Error(`Invalid FAQ index config YAML (${source}): ${message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`FAQ index config YAML must be a mapping (${source})`);
  }
  const map = data as Record<string, unknown>;
  const modelName = String(map.model_name ?? '').trim();
  if (!modelName) {
    throw new Error(
      `FAQ index config missing model_name. Set it in Admin → Pipelines → ${FAQ_KB_INDEX_PIPELINE_NAME} Config YAML.`,
    );
  }
  const dimensionsRaw = map.dimensions;
  const dimensions =
    typeof dimensionsRaw === 'number'
      ? dimensionsRaw
      : typeof dimensionsRaw === 'string'
        ? Number(dimensionsRaw.trim())
        : NaN;
  if (!Number.isFinite(dimensions) || dimensions < 1 || dimensions > 65536) {
    throw new Error(
      `FAQ index config missing or invalid dimensions (got ${String(dimensionsRaw)}). ` +
        `Set it in Admin → Pipelines → ${FAQ_KB_INDEX_PIPELINE_NAME} Config YAML.`,
    );
  }
  return { modelName, dimensions: Math.trunc(dimensions) };
}

export function resolveFaqIndexWorkflowYamlText(pipeline: {
  configYaml?: string | null;
} | null | undefined): { yaml: string; source: string; configYamlSnapshot: string | null } {
  const override = pipeline?.configYaml?.trim() || null;
  if (override) {
    return { yaml: override, source: 'pipeline.config_yaml', configYamlSnapshot: override };
  }
  const packaged = readCliPackagedDefaultConfigYaml(FAQ_KB_INDEX_PIPELINE_NAME);
  if (!packaged?.trim()) {
    throw new Error(
      `No FAQ index worker config found for pipeline ${FAQ_KB_INDEX_PIPELINE_NAME} ` +
        `(set Admin Config YAML or package openkms-cli/workflows/${FAQ_KB_INDEX_PIPELINE_NAME}.yml)`,
    );
  }
  return {
    yaml: packaged,
    source: 'cli packaged default',
    configYamlSnapshot: null,
  };
}
