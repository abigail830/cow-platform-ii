import { snapshotEvalJudgeDimensions } from './eval-judge-dimensions.ts';
import { resolveEvalJudgeConfigYamlForRun } from '../../shared/eval/eval-judge-workflow.ts';

export async function buildEvalRunJudgeMetrics(input: { datasetId: string; pipelineCount: number }) {
  const { configYaml, scenarioId } = await resolveEvalJudgeConfigYamlForRun(input);
  const dimensions = await snapshotEvalJudgeDimensions(scenarioId);
  return [{ scenario_id: scenarioId, dimensions, config_yaml: configYaml }];
}
