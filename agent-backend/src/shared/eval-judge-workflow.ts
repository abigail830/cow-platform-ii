/**
 * Eval judge (Full-mode compare) workflow YAML — model_name only; credentials from platform.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const EVAL_JUDGE_COMPARE_PIPELINE_NAME = 'eval-judge-compare';

const DEFAULT_CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../pipeline-workflows/eval-judge-compare.yml',
);

let cachedDefaultYaml: string | null = null;

export function defaultEvalJudgeConfigYaml(): string {
  if (cachedDefaultYaml) return cachedDefaultYaml;
  cachedDefaultYaml = readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
  return cachedDefaultYaml;
}

export function parseEvalJudgeModelName(configYaml: string, pipelineName = EVAL_JUDGE_COMPARE_PIPELINE_NAME): string {
  let data: unknown;
  try {
    data = parseYaml(configYaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML';
    throw new Error(`Invalid eval judge config YAML: ${message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Eval judge config YAML must be a mapping at the root');
  }
  const map = data as Record<string, unknown>;
  const top = String(map.model_name ?? '').trim();
  if (top) return top;

  const judge = map.judge;
  if (judge && typeof judge === 'object' && !Array.isArray(judge)) {
    const nested = String((judge as Record<string, unknown>).model_name ?? '').trim();
    if (nested) return nested;
  }

  throw new Error(
    `Eval judge config missing model_name. Set it in Admin → Pipelines → ${pipelineName} Config YAML ` +
      '(Models list bold name, api_type=chat-completions).',
  );
}

export function snapshotEvalJudgeConfigYaml(raw?: string | null): string {
  const text = raw?.trim();
  if (!text) return defaultEvalJudgeConfigYaml();
  parseEvalJudgeModelName(text);
  return text;
}

/** Prefer Admin → Pipelines system row; fall back to packaged default YAML. */
export async function resolveEvalJudgeConfigYaml(): Promise<string> {
  const { getPipelineConfigByPipelineName } = await import('../shared/pipeline-config-store.ts');
  const pipeline = await getPipelineConfigByPipelineName(EVAL_JUDGE_COMPARE_PIPELINE_NAME);
  if (pipeline?.configYaml?.trim()) {
    return snapshotEvalJudgeConfigYaml(pipeline.configYaml);
  }
  return defaultEvalJudgeConfigYaml();
}
