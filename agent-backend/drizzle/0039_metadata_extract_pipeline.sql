INSERT INTO "app_pipeline_configs" (
  "name",
  "description",
  "pipeline_name",
  "command_template",
  "workflow_file",
  "is_enabled",
  "is_system"
)
SELECT
  'Metadata Extract',
  'LLM metadata extraction on already-parsed documents (job stage=parsed).',
  'metadata-extract',
  'openkms-cli pipeline extract-metadata --job-id {job_id}',
  'openkms-metadata-extract.yml',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'metadata-extract'
);
