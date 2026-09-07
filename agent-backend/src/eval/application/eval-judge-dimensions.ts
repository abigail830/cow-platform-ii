import { DEFAULT_EVAL_JUDGE_SCENARIO_ID } from '../domain/eval-judge-constants.ts';
import { normalizeEvalJudgeDimensions } from '../domain/eval-judge-criteria.ts';
import type {
  EvalJudgeDimensionDefinition,
  EvalJudgeScenarioDefinition,
} from '../domain/eval-judge-types.ts';

export { DEFAULT_EVAL_JUDGE_SCENARIO_ID };
export type {
  EvalJudgeDimensionDefinition,
  EvalJudgeDimensionKind,
  EvalJudgeDimensionScope,
  EvalJudgeScenarioDefinition,
} from '../domain/eval-judge-types.ts';

export async function getEvalJudgeScenario(scenarioId: string): Promise<EvalJudgeScenarioDefinition | null> {
  const { getEvalJudgeScenarioDefinitionByKey } = await import('../infrastructure/eval-judge-scenario-store.ts');
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
  return normalizeEvalJudgeDimensions(scenario.dimensions.map((dimension) => ({ ...dimension })));
}

export async function listEvalJudgeScenarios(): Promise<EvalJudgeScenarioDefinition[]> {
  const { listEvalJudgeScenarioRows } = await import('../infrastructure/eval-judge-scenario-store.ts');
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
