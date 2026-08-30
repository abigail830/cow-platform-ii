/**
 * Eval judge (Full-mode compare) workflow YAML — model_name + scenario_id; credentials from platform.
 * Defaults live in `app_pipeline_configs.config_yaml` (system pipeline rows).
 */
import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_EVAL_JUDGE_SCENARIO_ID,
  DEFAULT_EVAL_JUDGE_DOC_SCENARIO_ID,
  EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME,
  EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME,
  EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME,
} from './eval-judge-constants.ts';

export const EVAL_JUDGE_COMPARE_PIPELINE_NAME = 'eval-judge-compare';

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

  if (pipelineName === EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME) {
    return DEFAULT_EVAL_JUDGE_DOC_SCENARIO_ID;
  }
  return DEFAULT_EVAL_JUDGE_SCENARIO_ID;
}

export function snapshotEvalJudgeConfigYaml(
  raw: string,
  pipelineName = EVAL_JUDGE_COMPARE_PIPELINE_NAME,
): string {
  const text = raw.trim();
  if (!text) {
    throw new Error(`Eval judge config YAML is empty for pipeline ${pipelineName}`);
  }
  parseEvalJudgeModelName(text, pipelineName);
  parseEvalJudgeScenarioId(text, pipelineName);
  return text;
}

async function resolveEvalJudgeConfigYamlForPipeline(pipelineName: string): Promise<string> {
  const { readSystemPipelineConfigYaml } = await import('../pipeline/pipeline-default-config.ts');
  const yaml = await readSystemPipelineConfigYaml(pipelineName);
  if (!yaml) {
    throw new Error(
      `System pipeline ${pipelineName} has no config_yaml in DB. Run db:migrate.`,
    );
  }
  return snapshotEvalJudgeConfigYaml(yaml, pipelineName);
}

export async function resolveEvalJudgeConfigYaml(): Promise<string> {
  return resolveEvalJudgeConfigYamlForPipeline(EVAL_JUDGE_COMPARE_PIPELINE_NAME);
}

export async function resolveEvalJudgeGtConfigYaml(): Promise<string> {
  return resolveEvalJudgeConfigYamlForPipeline(EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME);
}

export async function resolveEvalJudgeDocConfigYaml(): Promise<string> {
  return resolveEvalJudgeConfigYamlForPipeline(EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME);
}

export async function resolveEvalJudgeDocGtConfigYaml(): Promise<string> {
  return resolveEvalJudgeConfigYamlForPipeline(EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME);
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
