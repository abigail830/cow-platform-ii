export const DEFAULT_EVAL_JUDGE_SCENARIO_ID = 'asr_pipeline_compare_no_gt';
export const EVAL_JUDGE_GT_SCENARIO_ID = 'asr_pipeline_compare_with_gt';
export const EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME = 'eval-judge-compare-with-gt';

export const DEFAULT_EVAL_JUDGE_DOC_SCENARIO_ID = 'doc_parse_pipeline_compare_no_gt';
export const EVAL_JUDGE_DOC_GT_SCENARIO_ID = 'doc_parse_pipeline_compare_with_gt';
export const EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME = 'eval-judge-doc-compare';
export const EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME = 'eval-judge-doc-compare-with-gt';

export function isEvalJudgeGroundTruthScenario(scenarioId: string): boolean {
  return scenarioId === EVAL_JUDGE_GT_SCENARIO_ID || scenarioId === EVAL_JUDGE_DOC_GT_SCENARIO_ID;
}

export function resolveEvalJudgePipelineNameForScenario(scenarioId: string): string {
  if (scenarioId === EVAL_JUDGE_DOC_GT_SCENARIO_ID) {
    return EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME;
  }
  if (scenarioId === EVAL_JUDGE_GT_SCENARIO_ID) {
    return EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME;
  }
  if (scenarioId === DEFAULT_EVAL_JUDGE_DOC_SCENARIO_ID) {
    return EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME;
  }
  return 'eval-judge-compare';
}
