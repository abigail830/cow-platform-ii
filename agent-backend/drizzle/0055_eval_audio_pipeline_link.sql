ALTER TABLE "app_audio_pipeline_jobs" ADD COLUMN IF NOT EXISTS "eval_run_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_eval_run_items" ADD COLUMN IF NOT EXISTS "audio_pipeline_job_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_pipeline_jobs" ADD CONSTRAINT "app_audio_pipeline_jobs_eval_run_item_id_app_eval_run_items_id_fk" FOREIGN KEY ("eval_run_item_id") REFERENCES "public"."app_eval_run_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_items" ADD CONSTRAINT "app_eval_run_items_audio_pipeline_job_id_app_audio_pipeline_jobs_id_fk" FOREIGN KEY ("audio_pipeline_job_id") REFERENCES "public"."app_audio_pipeline_jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audio_pipeline_jobs_eval_item" ON "app_audio_pipeline_jobs" USING btree ("eval_run_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_items_audio_job" ON "app_eval_run_items" USING btree ("audio_pipeline_job_id");
