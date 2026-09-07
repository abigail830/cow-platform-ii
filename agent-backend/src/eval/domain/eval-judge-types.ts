export type EvalJudgeDimensionScope = 'variant' | 'pairwise' | 'variant_vs_gt';
export type EvalJudgeDimensionKind =
  | 'geval_score'
  | 'geval_winner'
  | 'cer_score'
  | 'wer_score'
  | 'hotword_recall_score'
  | 'hotword_precision_score'
  | 'hotword_f1_score'
  | 'faithfulness_score'
  | 'contextual_recall_score'
  | 'contextual_precision_score';

export type EvalJudgeDimensionDefinition = {
  id: string;
  label: string;
  scope: EvalJudgeDimensionScope;
  kind: EvalJudgeDimensionKind;
  weight: number;
  criteria: string;
  evaluation_steps?: string[];
  pass_threshold?: string;
};

export type EvalJudgeScenarioDefinition = {
  id: string;
  label: string;
  description: string;
  requires_ground_truth: boolean;
  min_variants: number;
  dimensions: EvalJudgeDimensionDefinition[];
};
