-- Document parse GT judge: CER/WER + DeepEval RAG dimensions with pass thresholds.
UPDATE "app_eval_judge_scenarios"
SET
  "dimensions" = $json$[
    {
      "id": "wer",
      "label": "Word Error Rate (WER)",
      "scope": "variant_vs_gt",
      "kind": "wer_score",
      "weight": 1.2,
      "pass_threshold": "<20%",
      "criteria": "Deterministic Word Error Rate (WER) between EXPECTED_OUTPUT (reference markdown) and ACTUAL_OUTPUT (parsed markdown). English words and digits are one token each; each CJK character is one token (supports mixed Chinese/English). Punctuation and spaces are ignored; lower is better."
    },
    {
      "id": "cer",
      "label": "Character Error Rate (CER)",
      "scope": "variant_vs_gt",
      "kind": "cer_score",
      "weight": 1.2,
      "pass_threshold": "<15%",
      "criteria": "Deterministic Character Error Rate (CER) between EXPECTED_OUTPUT (reference markdown) and ACTUAL_OUTPUT (parsed markdown). Compares lowercase alphanumeric and CJK characters only. Punctuation and spaces are ignored; lower is better."
    },
    {
      "id": "faithfulness",
      "label": "Faithfulness",
      "scope": "variant_vs_gt",
      "kind": "faithfulness_score",
      "weight": 1.5,
      "pass_threshold": ">=70%",
      "criteria": "DeepEval Faithfulness: ACTUAL_OUTPUT is the parsed markdown; retrieval context is the ground-truth reference markdown. Measures whether parsed content is supported by the reference (penalizes hallucinations and unsupported additions)."
    },
    {
      "id": "contextual_recall",
      "label": "Contextual recall",
      "scope": "variant_vs_gt",
      "kind": "contextual_recall_score",
      "weight": 1.5,
      "pass_threshold": ">=70%",
      "criteria": "DeepEval Contextual Recall: EXPECTED_OUTPUT is the ground-truth reference markdown; retrieval context is the parsed markdown. Measures how much reference content is captured in the parse (penalizes omissions)."
    },
    {
      "id": "contextual_precision",
      "label": "Contextual precision",
      "scope": "variant_vs_gt",
      "kind": "contextual_precision_score",
      "weight": 1.5,
      "pass_threshold": ">=70%",
      "criteria": "DeepEval Contextual Precision: EXPECTED_OUTPUT is the ground-truth reference markdown; retrieval context is the parsed markdown. Measures whether parsed content is relevant and grounded in the reference (penalizes noise and unsupported additions)."
    }
  ]$json$::jsonb,
  "updated_at" = now()
WHERE "scenario_key" = 'doc_parse_pipeline_compare_with_gt';
