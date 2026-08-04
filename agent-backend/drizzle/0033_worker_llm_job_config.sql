ALTER TABLE "app_pipeline_jobs" ADD COLUMN IF NOT EXISTS "metadata_extraction_config" jsonb;
--> statement-breakpoint
ALTER TABLE "app_kb_import_jobs" ADD COLUMN IF NOT EXISTS "worker_llm_config" jsonb;
