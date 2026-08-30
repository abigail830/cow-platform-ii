-- Remove CER from document parse GT judge scenario; fix recall/precision field mapping in criteria text.
UPDATE "app_eval_judge_scenarios"
SET
  "dimensions" = $json$[
    {
      "id": "faithfulness",
      "label": "Faithfulness",
      "scope": "variant_vs_gt",
      "kind": "faithfulness_score",
      "weight": 1.5,
      "criteria": "DeepEval Faithfulness: ACTUAL_OUTPUT is the parsed markdown; retrieval context is the ground-truth reference markdown. Measures whether parsed content is supported by the reference (penalizes hallucinations and unsupported additions)."
    },
    {
      "id": "contextual_recall",
      "label": "Contextual recall",
      "scope": "variant_vs_gt",
      "kind": "contextual_recall_score",
      "weight": 1.5,
      "criteria": "DeepEval Contextual Recall: EXPECTED_OUTPUT is the ground-truth reference markdown; retrieval context is the parsed markdown. Measures how much reference content is captured in the parse (penalizes omissions)."
    },
    {
      "id": "contextual_precision",
      "label": "Contextual precision",
      "scope": "variant_vs_gt",
      "kind": "contextual_precision_score",
      "weight": 1.5,
      "criteria": "DeepEval Contextual Precision: EXPECTED_OUTPUT is the ground-truth reference markdown; retrieval context is the parsed markdown. Measures whether parsed content is relevant and grounded in the reference (penalizes noise and unsupported additions)."
    }
  ]$json$::jsonb,
  "updated_at" = now()
WHERE "scenario_key" = 'doc_parse_pipeline_compare_with_gt';
