-- Async pipeline job retry metrics + capture post-process materializing stage support.

ALTER TABLE "app_pipeline_jobs" ADD COLUMN IF NOT EXISTS "metrics" jsonb;
ALTER TABLE "app_audio_pipeline_jobs" ADD COLUMN IF NOT EXISTS "metrics" jsonb;
ALTER TABLE "app_document_capture_pipeline_jobs" ADD COLUMN IF NOT EXISTS "metrics" jsonb;
ALTER TABLE "app_kb_import_jobs" ADD COLUMN IF NOT EXISTS "metrics" jsonb;
