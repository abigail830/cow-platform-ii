-- Link eval run items to document parse pipeline jobs (mirrors audio eval bridge).
ALTER TABLE "app_pipeline_jobs" ADD COLUMN IF NOT EXISTS "eval_run_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_eval_run_items" ADD COLUMN IF NOT EXISTS "document_pipeline_job_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_pipeline_jobs" ADD CONSTRAINT "app_pipeline_jobs_eval_run_item_id_app_eval_run_items_id_fk" FOREIGN KEY ("eval_run_item_id") REFERENCES "public"."app_eval_run_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_items" ADD CONSTRAINT "app_eval_run_items_document_pipeline_job_id_app_pipeline_jobs_id_fk" FOREIGN KEY ("document_pipeline_job_id") REFERENCES "public"."app_pipeline_jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_jobs_eval_item" ON "app_pipeline_jobs" USING btree ("eval_run_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_items_document_job" ON "app_eval_run_items" USING btree ("document_pipeline_job_id");
