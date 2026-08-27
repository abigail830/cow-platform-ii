import catalog from '../shared/eval-judge-dimensions.json';

export type EvalJudgeDimensionScope = 'variant' | 'pairwise';
export type EvalJudgeDimensionKind = 'geval_score' | 'geval_winner';

export type EvalJudgeDimensionDefinition = {
  id: string;
  label: string;
  scope: EvalJudgeDimensionScope;
  kind: EvalJudgeDimensionKind;
  weight: number;
  criteria: string;
};

export type EvalJudgeScenarioDefinition = {
  id: string;
  label: string;
  description: string;
  requires_ground_truth: boolean;
  min_variants: number;
  dimensions: EvalJudgeDimensionDefinition[];
};

const scenarios = catalog.scenarios as Record<string, EvalJudgeScenarioDefinition>;

export const DEFAULT_EVAL_JUDGE_SCENARIO_ID = 'asr_pipeline_compare_no_gt';

export function getEvalJudgeScenario(scenarioId: string): EvalJudgeScenarioDefinition | null {
  return scenarios[scenarioId] ?? null;
}

export function getDefaultEvalJudgeScenario(): EvalJudgeScenarioDefinition {
  const scenario = getEvalJudgeScenario(DEFAULT_EVAL_JUDGE_SCENARIO_ID);
  if (!scenario) {
    throw new Error(`Missing default eval judge scenario: ${DEFAULT_EVAL_JUDGE_SCENARIO_ID}`);
  }
  return scenario;
}

export function snapshotEvalJudgeDimensions(scenarioId = DEFAULT_EVAL_JUDGE_SCENARIO_ID): EvalJudgeDimensionDefinition[] {
  const scenario = getEvalJudgeScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown eval judge scenario: ${scenarioId}`);
  return scenario.dimensions.map((dimension) => ({ ...dimension }));
}

export function listEvalJudgeScenarios(): EvalJudgeScenarioDefinition[] {
  return Object.values(scenarios);
}
