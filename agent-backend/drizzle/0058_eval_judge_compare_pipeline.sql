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
  'Eval Judge Compare',
  'Full-mode eval: DeepEval LLM-as-judge compare across ASR transcripts (no ground truth).',
  'eval-judge-compare',
  'evaluate-cli judge run-async --job-id {job_id}',
  'evaluate-pipeline.yml',
  $yaml$# Default worker config for eval Full-mode compare/judge (DeepEval GEval).
# model_name = Models list bold name (app_model_configs.name), api_type=chat-completions.
# Credentials via GET /internal-api/models/cli-params?model_name=…

model_name: "deepSeek-V4-Flash"
$yaml$,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'eval-judge-compare'
);
