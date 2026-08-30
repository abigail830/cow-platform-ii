/**
 * Eval judge (Full-mode compare) workflow YAML — model_name + scenario_id; credentials from platform.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_EVAL_JUDGE_SCENARIO_ID,
  DEFAULT_EVAL_JUDGE_DOC_SCENARIO_ID,
  EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME,
  EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME,
  EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME,
} from './eval-judge-constants.ts';

export const EVAL_JUDGE_COMPARE_PIPELINE_NAME = 'eval-judge-compare';

const DEFAULT_CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../pipeline-workflows/eval-judge-compare.yml',
);

const DEFAULT_GT_CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../pipeline-workflows/eval-judge-compare-with-gt.yml',
);

const DEFAULT_DOC_CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../pipeline-workflows/eval-judge-doc-compare.yml',
);

const DEFAULT_DOC_GT_CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../pipeline-workflows/eval-judge-doc-compare-with-gt.yml',
);

let cachedDefaultYaml: string | null = null;
let cachedDefaultGtYaml: string | null = null;
let cachedDefaultDocYaml: string | null = null;
let cachedDefaultDocGtYaml: string | null = null;

export function defaultEvalJudgeConfigYaml(): string {
  if (cachedDefaultYaml) return cachedDefaultYaml;
  cachedDefaultYaml = readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
  return cachedDefaultYaml;
}

export function defaultEvalJudgeGtConfigYaml(): string {
  if (cachedDefaultGtYaml) return cachedDefaultGtYaml;
  cachedDefaultGtYaml = readFileSync(DEFAULT_GT_CONFIG_PATH, 'utf8');
  return cachedDefaultGtYaml;
}

export function defaultEvalJudgeDocConfigYaml(): string {
  if (cachedDefaultDocYaml) return cachedDefaultDocYaml;
  cachedDefaultDocYaml = readFileSync(DEFAULT_DOC_CONFIG_PATH, 'utf8');
  return cachedDefaultDocYaml;
}

export function defaultEvalJudgeDocGtConfigYaml(): string {
  if (cachedDefaultDocGtYaml) return cachedDefaultDocGtYaml;
  cachedDefaultDocGtYaml = readFileSync(DEFAULT_DOC_GT_CONFIG_PATH, 'utf8');
  return cachedDefaultDocGtYaml;
}

function parseEvalJudgeConfigRoot(configYaml: string, pipelineName = EVAL_JUDGE_COMPARE_PIPELINE_NAME) {
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
  return data as Record<string, unknown>;
}

export function parseEvalJudgeModelName(configYaml: string, pipelineName = EVAL_JUDGE_COMPARE_PIPELINE_NAME): string {
  const map = parseEvalJudgeConfigRoot(configYaml, pipelineName);
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

export function parseEvalJudgeScenarioId(
  configYaml: string,
  pipelineName = EVAL_JUDGE_COMPARE_PIPELINE_NAME,
): string {
  const map = parseEvalJudgeConfigRoot(configYaml, pipelineName);
  const top = String(map.scenario_id ?? '').trim();
  if (top) return top;

  const judge = map.judge;
  if (judge && typeof judge === 'object' && !Array.isArray(judge)) {
    const nested = String((judge as Record<string, unknown>).scenario_id ?? '').trim();
    if (nested) return nested;
  }

  return DEFAULT_EVAL_JUDGE_SCENARIO_ID;
}

export function snapshotEvalJudgeConfigYaml(
  raw?: string | null,
  pipelineName = EVAL_JUDGE_COMPARE_PIPELINE_NAME,
): string {
  const text = raw?.trim();
  if (!text) {
    if (pipelineName === EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME) {
      return defaultEvalJudgeGtConfigYaml();
    }
    if (pipelineName === EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME) {
      return defaultEvalJudgeDocGtConfigYaml();
    }
    if (pipelineName === EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME) {
      return defaultEvalJudgeDocConfigYaml();
    }
    return defaultEvalJudgeConfigYaml();
  }
  parseEvalJudgeModelName(text, pipelineName);
  parseEvalJudgeScenarioId(text, pipelineName);
  return text;
}

/** Prefer Admin → Pipelines system row; fall back to packaged default YAML. */
export async function resolveEvalJudgeConfigYaml(): Promise<string> {
  const { getPipelineConfigByPipelineName } = await import('../pipeline/pipeline-config-store.ts');
  const pipeline = await getPipelineConfigByPipelineName(EVAL_JUDGE_COMPARE_PIPELINE_NAME);
  if (pipeline?.configYaml?.trim()) {
    return snapshotEvalJudgeConfigYaml(pipeline.configYaml);
  }
  return defaultEvalJudgeConfigYaml();
}

export async function resolveEvalJudgeGtConfigYaml(): Promise<string> {
  const { getPipelineConfigByPipelineName } = await import('../pipeline/pipeline-config-store.ts');
  const pipeline = await getPipelineConfigByPipelineName(EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME);
  if (pipeline?.configYaml?.trim()) {
    return snapshotEvalJudgeConfigYaml(pipeline.configYaml, EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME);
  }
  return defaultEvalJudgeGtConfigYaml();
}

export async function resolveEvalJudgeDocConfigYaml(): Promise<string> {
  const { getPipelineConfigByPipelineName } = await import('../pipeline/pipeline-config-store.ts');
  const pipeline = await getPipelineConfigByPipelineName(EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME);
  if (pipeline?.configYaml?.trim()) {
    return snapshotEvalJudgeConfigYaml(pipeline.configYaml, EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME);
  }
  return defaultEvalJudgeDocConfigYaml();
}

export async function resolveEvalJudgeDocGtConfigYaml(): Promise<string> {
  const { getPipelineConfigByPipelineName } = await import('../pipeline/pipeline-config-store.ts');
  const pipeline = await getPipelineConfigByPipelineName(EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME);
  if (pipeline?.configYaml?.trim()) {
    return snapshotEvalJudgeConfigYaml(pipeline.configYaml, EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME);
  }
  return defaultEvalJudgeDocGtConfigYaml();
}

/**
 * Full-mode judge config: multi-pipeline runs use pairwise/no-GT; single-pipeline runs
 * score each transcript against ground-truth references (requires GT on the dataset).
 */
export async function resolveEvalJudgeConfigYamlForRun(input: {
  datasetId: string;
  pipelineCount: number;
}): Promise<{ configYaml: string; scenarioId: string }> {
  const { getEvalDatasetById } = await import('../../services/eval/eval-datasets.ts');
  const dataset = await getEvalDatasetById(input.datasetId);
  if (!dataset) throw new Error('Eval dataset not found');

  const isDocument = dataset.mediaType === 'document';
  const pipelineCount = Math.max(0, input.pipelineCount);
  if (pipelineCount === 0) {
    throw new Error('At least one pipeline is required');
  }

  const { assertEvalJudgeScenarioExists, getEvalJudgeScenario } = await import(
    '../../services/eval/eval-judge-dimensions.ts'
  );

  if (pipelineCount >= 2) {
    const configYaml = isDocument
      ? await resolveEvalJudgeDocConfigYaml()
      : await resolveEvalJudgeConfigYaml();
    const pipelineName = isDocument
      ? EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME
      : EVAL_JUDGE_COMPARE_PIPELINE_NAME;
    const scenarioId = parseEvalJudgeScenarioId(configYaml, pipelineName);
    await assertEvalJudgeScenarioExists(scenarioId);
    return { configYaml, scenarioId };
  }

  const configYaml = isDocument
    ? await resolveEvalJudgeDocGtConfigYaml()
    : await resolveEvalJudgeGtConfigYaml();
  const pipelineName = isDocument
    ? EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME
    : EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME;
  const scenarioId = parseEvalJudgeScenarioId(configYaml, pipelineName);
  await assertEvalJudgeScenarioExists(scenarioId);
  const scenario = await getEvalJudgeScenario(scenarioId);
  if (scenario?.requires_ground_truth) {
    const { assertEvalDatasetGroundTruthReady } = await import('../../services/eval/eval-datasets.ts');
    await assertEvalDatasetGroundTruthReady(input.datasetId, scenario.label);
  }
  return { configYaml, scenarioId };
}

export async function resolveEvalJudgeScenarioId(): Promise<string> {
  const configYaml = await resolveEvalJudgeConfigYaml();
  const scenarioId = parseEvalJudgeScenarioId(configYaml);
  const { assertEvalJudgeScenarioExists } = await import('../../services/eval/eval-judge-dimensions.ts');
  await assertEvalJudgeScenarioExists(scenarioId);
  return scenarioId;
}
