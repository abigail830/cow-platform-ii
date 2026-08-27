-- ASR pipeline compare with ground-truth references (per-pipeline absolute scores vs GT).
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
  'asr_pipeline_compare_with_gt',
  'ASR pipeline compare (with ground truth)',
  'LLM-as-judge dimensions scoring each ASR transcript against a human reference (EXPECTED_OUTPUT) per dataset item.',
  true,
  1,
  $json$[
    {
      "id": "cer",
      "label": "Character Error Rate (CER)",
      "scope": "variant_vs_gt",
      "kind": "cer_score",
      "weight": 1.5,
      "criteria": "Deterministic Character Error Rate (CER) between EXPECTED_OUTPUT (reference) and ACTUAL_OUTPUT (ASR transcript). Spaces are ignored; lower is better."
    },
    {
      "id": "semantic_fidelity",
      "label": "Semantic fidelity",
      "scope": "variant_vs_gt",
      "kind": "geval_score",
      "weight": 1.5,
      "criteria": "A human reference transcript is provided as EXPECTED_OUTPUT and an ASR transcript as ACTUAL_OUTPUT. Score how well the ASR output preserves the meaning, facts, and conclusions of the reference. Assign an integer score from 0 to 10 only, using these bands: 0–2 = wrong topic or major factual errors vs reference; 3–4 = same topic but substantial meaning loss or conflicts; 5–6 = partial fidelity with notable omissions or additions; 7–8 = strong fidelity (same meaning, minor ASR wording variance); 9–10 = semantically equivalent aside from wording/punctuation. Explain your score in 1–2 sentences."
    },
    {
      "id": "entity_accuracy",
      "label": "Entity accuracy",
      "scope": "variant_vs_gt",
      "kind": "geval_score",
      "weight": 1.2,
      "criteria": "EXPECTED_OUTPUT is the human reference and ACTUAL_OUTPUT is the ASR transcript. Compare key entities only: proper nouns, numbers, dates, times, phone numbers, order IDs, brand names, and technical terms. Penalize any wrong, missing, or invented entity even when overall meaning seems close. Assign an integer score from 0 to 10 only, using these bands: 0–2 = multiple critical entity errors; 3–4 = at least one critical entity wrong or missing; 5–6 = minor entity issues or ambiguous substitutions; 7–8 = entities mostly correct with small formatting differences; 9–10 = all key entities match. Explain your score in 1–2 sentences."
    },
    {
      "id": "artifact_control",
      "label": "Artifact control",
      "scope": "variant_vs_gt",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "EXPECTED_OUTPUT is the human reference and ACTUAL_OUTPUT is the ASR transcript. Evaluate ASR artifact level in ACTUAL_OUTPUT: excessive repetition, hallucinated phrases, gibberish, or unrelated insertions not supported by the reference meaning. Assign an integer score from 0 to 10 only, using these bands: 0–2 = heavy artifacts; 3–4 = frequent artifacts; 5–6 = moderate; 7–8 = light; 9–10 = clean. Explain your score in 1–2 sentences."
    }
  ]$json$::jsonb,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_eval_judge_scenarios" WHERE "scenario_key" = 'asr_pipeline_compare_with_gt'
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
  'Eval Judge Compare (GT)',
  'Full-mode eval: DeepEval LLM-as-judge scoring ASR transcripts against ground-truth references.',
  'eval-judge-compare-with-gt',
  'evaluate-cli judge run-async --job-id {job_id}',
  'evaluate-pipeline.yml',
  $yaml$# Full-mode eval judge with ground-truth reference transcripts (DeepEval GEval).
# model_name = Models list bold name (app_model_configs.name), api_type=chat-completions.
# scenario_id = Judge Dimensions scenario key (Admin → Judge Dimensions).
# Credentials via GET /internal-api/models/cli-params?model_name=…

model_name: "deepSeek-V4-Flash"
scenario_id: "asr_pipeline_compare_with_gt"
$yaml$,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'eval-judge-compare-with-gt'
);
