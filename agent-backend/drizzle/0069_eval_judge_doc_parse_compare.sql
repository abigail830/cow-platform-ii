-- Document parse pipeline compare judge scenarios (DeepEval RAG metrics + GEval pairwise).

INSERT INTO "app_eval_judge_scenarios" (
  "scenario_key",
  "label",
  "description",
  "requires_ground_truth",
  "min_variants",
  "dimensions",
  "is_system",
  "is_enabled"
)
SELECT
  'doc_parse_pipeline_compare_no_gt',
  'Document parse compare (no ground truth)',
  'Reference-free LLM-as-judge dimensions for comparing two or more document parse outputs on the same file.',
  false,
  2,
  $json$[
    {
      "id": "structure_completeness",
      "label": "Structure completeness",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate whether this parsed markdown appears structurally complete for a document: headings, lists, tables, and body text are present where expected and the output does not end mid-section. Score from 0 (clearly incomplete) to 10 (appears complete)."
    },
    {
      "id": "readability",
      "label": "Readability",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate readability of the parsed markdown: heading hierarchy, paragraph breaks, list formatting, and table structure. Score from 0 (hard to read) to 10 (easy to read)."
    },
    {
      "id": "artifact_control",
      "label": "Artifact control",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate whether the parse avoids common OCR/layout artifacts: repeated blocks, gibberish tokens, broken encoding, or unrelated insertions. Score from 0 (heavy artifacts) to 10 (clean output)."
    },
    {
      "id": "semantic_agreement",
      "label": "Semantic agreement",
      "scope": "pairwise",
      "kind": "geval_score",
      "weight": 1.5,
      "criteria": "Two parsed markdown outputs from the same document are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). Score how well they convey the same overall meaning and key facts. Assign an integer score from 0 to 10 only."
    },
    {
      "id": "relative_quality",
      "label": "Relative quality",
      "scope": "pairwise",
      "kind": "geval_winner",
      "weight": 1,
      "criteria": "Two parsed markdown outputs from the same document are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). Without any ground-truth reference, decide which parse is overall more useful for a human reviewer. Reply with A, B, or TIE plus brief justification."
    }
  ]$json$::jsonb,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_eval_judge_scenarios" WHERE "scenario_key" = 'doc_parse_pipeline_compare_no_gt'
);

INSERT INTO "app_eval_judge_scenarios" (
  "scenario_key",
  "label",
  "description",
  "requires_ground_truth",
  "min_variants",
  "dimensions",
  "is_system",
  "is_enabled"
)
SELECT
  'doc_parse_pipeline_compare_with_gt',
  'Document parse compare (with ground truth)',
  'DeepEval RAG-style dimensions scoring each parsed markdown against a human reference (EXPECTED_OUTPUT) per dataset item.',
  true,
  1,
  $json$[
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
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_eval_judge_scenarios" WHERE "scenario_key" = 'doc_parse_pipeline_compare_with_gt'
);

INSERT INTO "app_pipeline_configs" (
  "name",
  "description",
  "pipeline_name",
  "command_template",
  "workflow_file",
  "config_yaml",
  "is_enabled",
  "is_system"
)
SELECT
  'Eval Judge Doc Compare',
  'Full-mode eval: DeepEval LLM-as-judge comparing document parse outputs (no ground truth).',
  'eval-judge-doc-compare',
  'evaluate-cli judge run-async --job-id {job_id}',
  'evaluate-pipeline.yml',
  $yaml$# Full-mode document parse judge (DeepEval GEval pairwise + variant rubrics).
# model_name = Models list bold name (app_model_configs.name), api_type=chat-completions.
# scenario_id = Judge Dimensions scenario key (Admin → Judge Dimensions).
# Credentials via GET /internal-api/models/cli-params?model_name=…

model_name: "deepSeek-V4-Flash"
scenario_id: "doc_parse_pipeline_compare_no_gt"
$yaml$,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'eval-judge-doc-compare'
);

INSERT INTO "app_pipeline_configs" (
  "name",
  "description",
  "pipeline_name",
  "command_template",
  "workflow_file",
  "config_yaml",
  "is_enabled",
  "is_system"
)
SELECT
  'Eval Judge Doc Compare (GT)',
  'Full-mode eval: DeepEval RAG metrics scoring document parse markdown against ground-truth references.',
  'eval-judge-doc-compare-with-gt',
  'evaluate-cli judge run-async --job-id {job_id}',
  'evaluate-pipeline.yml',
  $yaml$# Full-mode document parse judge with ground-truth reference markdown (DeepEval RAG + CER).
# model_name = Models list bold name (app_model_configs.name), api_type=chat-completions.
# scenario_id = Judge Dimensions scenario key (Admin → Judge Dimensions).
# Credentials via GET /internal-api/models/cli-params?model_name=…

model_name: "deepSeek-V4-Flash"
scenario_id: "doc_parse_pipeline_compare_with_gt"
$yaml$,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'eval-judge-doc-compare-with-gt'
);
