UPDATE "app_pipeline_configs"
SET
  "workflow_file" = 'openkms-audio-transcribe.yml',
  "updated_at" = NOW()
WHERE "pipeline_name" = 'aliyun-qwen-audio-transcribe'
  AND ("workflow_file" IS NULL OR "workflow_file" = '');
