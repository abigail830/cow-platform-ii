import { DEFAULT_EVAL_JUDGE_SCENARIO_ID } from '../shared/eval-judge-constants.ts';

export { DEFAULT_EVAL_JUDGE_SCENARIO_ID };

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

export async function getEvalJudgeScenario(scenarioId: string): Promise<EvalJudgeScenarioDefinition | null> {
  const { getEvalJudgeScenarioDefinitionByKey } = await import('../shared/eval-judge-scenario-store.ts');
  return getEvalJudgeScenarioDefinitionByKey(scenarioId);
}

export async function getDefaultEvalJudgeScenario(): Promise<EvalJudgeScenarioDefinition> {
  const scenario = await getEvalJudgeScenario(DEFAULT_EVAL_JUDGE_SCENARIO_ID);
  if (!scenario) {
    throw new Error(
      `Missing default eval judge scenario in DB: ${DEFAULT_EVAL_JUDGE_SCENARIO_ID}. Run db:migrate.`,
    );
  }
  return scenario;
}

export async function snapshotEvalJudgeDimensions(
  scenarioId = DEFAULT_EVAL_JUDGE_SCENARIO_ID,
): Promise<EvalJudgeDimensionDefinition[]> {
  const scenario = await getEvalJudgeScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown eval judge scenario: ${scenarioId}`);
  return scenario.dimensions.map((dimension) => ({ ...dimension }));
}

export async function listEvalJudgeScenarios(): Promise<EvalJudgeScenarioDefinition[]> {
  const { listEvalJudgeScenarioRows } = await import('../shared/eval-judge-scenario-store.ts');
  const { scenarios: rows } = await listEvalJudgeScenarioRows({ enabledOnly: true, limit: 100 });
  return rows.map((row) => ({
    id: row.scenario_key,
    label: row.label,
    description: row.description ?? '',
    requires_ground_truth: row.requires_ground_truth,
    min_variants: row.min_variants,
    dimensions: row.dimensions,
  }));
}

export async function assertEvalJudgeScenarioExists(scenarioId: string): Promise<void> {
  const scenario = await getEvalJudgeScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown eval judge scenario: ${scenarioId}`);
}
