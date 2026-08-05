-- Mark seeded document-parse pipelines as system (same as KB pipelines).
UPDATE "app_pipeline_configs"
SET "is_system" = true, "updated_at" = NOW()
WHERE "pipeline_name" IN (
  'baidu-doc-parse',
  'aliyun-docmind-parse',
  'paddleocr-doc-parse'
);
