ALTER TABLE "app_eval_runs" ADD COLUMN IF NOT EXISTS "run_mode" text DEFAULT 'pipeline_only' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_eval_runs" ADD COLUMN IF NOT EXISTS "total_compare_items" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_eval_runs" ADD COLUMN IF NOT EXISTS "completed_compare_items" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_eval_runs" ADD COLUMN IF NOT EXISTS "failed_compare_items" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_eval_run_items" ADD COLUMN IF NOT EXISTS "pipeline_name" text;
--> statement-breakpoint
ALTER TABLE "app_eval_run_items" ADD COLUMN IF NOT EXISTS "config_yaml" text;
--> statement-breakpoint
UPDATE "app_eval_run_items" AS items
SET "pipeline_name" = variants."pipeline_name"
FROM "app_eval_run_variants" AS variants
WHERE items."variant_id" = variants."id" AND items."pipeline_name" IS NULL;
--> statement-breakpoint
UPDATE "app_eval_run_items" AS items
SET "config_yaml" = variants."config_yaml"
FROM "app_eval_run_variants" AS variants
WHERE items."variant_id" = variants."id" AND items."config_yaml" IS NULL;
--> statement-breakpoint
ALTER TABLE "app_eval_run_items" ALTER COLUMN "pipeline_name" SET NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_eval_run_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"dataset_item_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_s3_key" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_comparisons_run" ON "app_eval_run_comparisons" USING btree ("run_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_eval_run_comparisons_run_item" ON "app_eval_run_comparisons" USING btree ("run_id","dataset_item_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_comparisons" ADD CONSTRAINT "app_eval_run_comparisons_run_id_app_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."app_eval_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_comparisons" ADD CONSTRAINT "app_eval_run_comparisons_dataset_item_id_app_eval_dataset_items_id_fk" FOREIGN KEY ("dataset_item_id") REFERENCES "public"."app_eval_dataset_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
