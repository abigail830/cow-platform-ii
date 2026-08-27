CREATE TABLE IF NOT EXISTS "app_eval_run_judge_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"dataset_item_id" uuid NOT NULL,
	"scenario_id" text NOT NULL,
	"dimensions_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_s3_key" text,
	"error_message" text,
	"summary_metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_eval_run_judge_jobs" ADD CONSTRAINT "app_eval_run_judge_jobs_run_id_app_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."app_eval_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_eval_run_judge_jobs" ADD CONSTRAINT "app_eval_run_judge_jobs_attempt_id_app_eval_run_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."app_eval_run_attempts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_eval_run_judge_jobs" ADD CONSTRAINT "app_eval_run_judge_jobs_dataset_item_id_app_eval_dataset_items_id_fk" FOREIGN KEY ("dataset_item_id") REFERENCES "public"."app_eval_dataset_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_judge_jobs_run" ON "app_eval_run_judge_jobs" USING btree ("run_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_judge_jobs_attempt" ON "app_eval_run_judge_jobs" USING btree ("attempt_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_eval_run_judge_jobs_attempt_item" ON "app_eval_run_judge_jobs" USING btree ("attempt_id","dataset_item_id");
