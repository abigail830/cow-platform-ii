import {
  EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME,
  EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME,
  EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME,
} from '../domain/eval-judge-constants.ts';
import {
  EVAL_JUDGE_COMPARE_PIPELINE_NAME,
  parseEvalJudgeScenarioId,
  resolveEvalJudgeConfigYaml,
  resolveEvalJudgeDocConfigYaml,
  resolveEvalJudgeDocGtConfigYaml,
  resolveEvalJudgeGtConfigYaml,
} from '../domain/eval-judge-workflow.ts';
import { assertEvalJudgeScenarioExists, getEvalJudgeScenario } from './eval-judge-dimensions.ts';

/**
 * Full-mode judge config: multi-pipeline runs use pairwise/no-GT; single-pipeline runs
 * score each transcript against ground-truth references (requires GT on the dataset).
 */
export async function resolveEvalJudgeConfigYamlForRun(input: {
  datasetId: string;
  pipelineCount: number;
}): Promise<{ configYaml: string; scenarioId: string }> {
  const { getEvalDatasetById } = await import('./eval-datasets.ts');
  const dataset = await getEvalDatasetById(input.datasetId);
  if (!dataset) throw new Error('Eval dataset not found');

  const isDocument = dataset.mediaType === 'document';
  const pipelineCount = Math.max(0, input.pipelineCount);
  if (pipelineCount === 0) {
    throw new Error('At least one pipeline is required');
  }

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
    const { assertEvalDatasetGroundTruthReady } = await import('./eval-datasets.ts');
    await assertEvalDatasetGroundTruthReady(input.datasetId, scenario.label);
  }
  return { configYaml, scenarioId };
}

export async function resolveEvalJudgeScenarioIdForDefaultConfig(): Promise<string> {
  const configYaml = await resolveEvalJudgeConfigYaml();
  const scenarioId = parseEvalJudgeScenarioId(configYaml);
  await assertEvalJudgeScenarioExists(scenarioId);
  return scenarioId;
}
