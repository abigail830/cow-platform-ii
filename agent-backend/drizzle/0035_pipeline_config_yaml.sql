ALTER TABLE "app_pipeline_configs" ADD COLUMN "config_yaml" text;--> statement-breakpoint
ALTER TABLE "app_pipeline_jobs" ADD COLUMN "config_yaml" text;--> statement-breakpoint
ALTER TABLE "app_kb_import_jobs" ADD COLUMN "config_yaml" text;--> statement-breakpoint
ALTER TABLE "app_pipeline_jobs" DROP COLUMN IF EXISTS "extraction_args";--> statement-breakpoint
ALTER TABLE "app_pipeline_jobs" DROP COLUMN IF EXISTS "metadata_extraction_config";--> statement-breakpoint
ALTER TABLE "app_pipeline_jobs" DROP COLUMN IF EXISTS "vlm_args";--> statement-breakpoint
ALTER TABLE "app_kb_import_jobs" DROP COLUMN IF EXISTS "worker_llm_config";
