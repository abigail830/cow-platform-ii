CREATE TABLE IF NOT EXISTS "app_eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"phase" text DEFAULT 'transcribing' NOT NULL,
	"eval_type" text DEFAULT 'asr_pipeline_compare' NOT NULL,
	"judge_enabled" boolean DEFAULT false NOT NULL,
	"judge_metrics" jsonb,
	"total_run_items" integer DEFAULT 0 NOT NULL,
	"completed_run_items" integer DEFAULT 0 NOT NULL,
	"failed_run_items" integer DEFAULT 0 NOT NULL,
	"summary_metrics" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_runs_dataset" ON "app_eval_runs" USING btree ("dataset_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_runs_status" ON "app_eval_runs" USING btree ("status","updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_eval_run_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"pipeline_config_id" uuid NOT NULL,
	"pipeline_name" text NOT NULL,
	"display_name" text NOT NULL,
	"config_yaml" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_variants_run" ON "app_eval_run_variants" USING btree ("run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_eval_run_variants_run_pipeline" ON "app_eval_run_variants" USING btree ("run_id","pipeline_config_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_eval_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"dataset_item_id" uuid NOT NULL,
	"stage" text DEFAULT 'submitted' NOT NULL,
	"external_job_id" text,
	"output_s3_prefix" text NOT NULL,
	"transcript_s3_key" text,
	"asr_result_s3_key" text,
	"error_message" text,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_items_run" ON "app_eval_run_items" USING btree ("run_id","stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_items_variant" ON "app_eval_run_items" USING btree ("variant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_eval_run_items_variant_item" ON "app_eval_run_items" USING btree ("variant_id","dataset_item_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_runs" ADD CONSTRAINT "app_eval_runs_dataset_id_app_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."app_eval_datasets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_runs" ADD CONSTRAINT "app_eval_runs_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_variants" ADD CONSTRAINT "app_eval_run_variants_run_id_app_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."app_eval_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_variants" ADD CONSTRAINT "app_eval_run_variants_pipeline_config_id_app_pipeline_configs_id_fk" FOREIGN KEY ("pipeline_config_id") REFERENCES "public"."app_pipeline_configs"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_items" ADD CONSTRAINT "app_eval_run_items_run_id_app_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."app_eval_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_items" ADD CONSTRAINT "app_eval_run_items_variant_id_app_eval_run_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."app_eval_run_variants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_items" ADD CONSTRAINT "app_eval_run_items_dataset_item_id_app_eval_dataset_items_id_fk" FOREIGN KEY ("dataset_item_id") REFERENCES "public"."app_eval_dataset_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
