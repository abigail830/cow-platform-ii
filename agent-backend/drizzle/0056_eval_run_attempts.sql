CREATE TABLE IF NOT EXISTS "app_eval_run_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"phase" text DEFAULT 'transcribing' NOT NULL,
	"run_mode" text DEFAULT 'pipeline_only' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"total_run_items" integer DEFAULT 0 NOT NULL,
	"completed_run_items" integer DEFAULT 0 NOT NULL,
	"failed_run_items" integer DEFAULT 0 NOT NULL,
	"total_compare_items" integer DEFAULT 0 NOT NULL,
	"completed_compare_items" integer DEFAULT 0 NOT NULL,
	"failed_compare_items" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_eval_run_items" ADD COLUMN IF NOT EXISTS "attempt_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_eval_run_comparisons" ADD COLUMN IF NOT EXISTS "attempt_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_attempts" ADD CONSTRAINT "app_eval_run_attempts_run_id_app_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."app_eval_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_run_attempts_run" ON "app_eval_run_attempts" USING btree ("run_id","attempt_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_eval_run_attempts_run_number" ON "app_eval_run_attempts" USING btree ("run_id","attempt_number");
--> statement-breakpoint
INSERT INTO "app_eval_run_attempts" (
	"id", "run_id", "attempt_number", "status", "phase", "run_mode",
	"started_at", "finished_at",
	"total_run_items", "completed_run_items", "failed_run_items",
	"total_compare_items", "completed_compare_items", "failed_compare_items",
	"created_at", "updated_at"
)
SELECT
	gen_random_uuid(),
	r."id",
	1,
	r."status",
	r."phase",
	r."run_mode",
	r."created_at",
	CASE WHEN r."status" IN ('draft', 'running') THEN NULL ELSE r."updated_at" END,
	r."total_run_items",
	r."completed_run_items",
	r."failed_run_items",
	r."total_compare_items",
	r."completed_compare_items",
	r."failed_compare_items",
	r."created_at",
	r."updated_at"
FROM "app_eval_runs" r
WHERE EXISTS (SELECT 1 FROM "app_eval_run_items" i WHERE i."run_id" = r."id")
  AND NOT EXISTS (SELECT 1 FROM "app_eval_run_attempts" a WHERE a."run_id" = r."id");
--> statement-breakpoint
UPDATE "app_eval_run_items" AS items
SET "attempt_id" = attempts."id"
FROM "app_eval_run_attempts" AS attempts
WHERE items."run_id" = attempts."run_id"
  AND attempts."attempt_number" = 1
  AND items."attempt_id" IS NULL;
--> statement-breakpoint
UPDATE "app_eval_run_comparisons" AS comparisons
SET "attempt_id" = attempts."id"
FROM "app_eval_run_attempts" AS attempts
WHERE comparisons."run_id" = attempts."run_id"
  AND attempts."attempt_number" = 1
  AND comparisons."attempt_id" IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_eval_run_items_variant_item";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_eval_run_items_attempt_variant_item" ON "app_eval_run_items" USING btree ("attempt_id","variant_id","dataset_item_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_eval_run_comparisons_run_item";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_eval_run_comparisons_attempt_item" ON "app_eval_run_comparisons" USING btree ("attempt_id","dataset_item_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_items" ADD CONSTRAINT "app_eval_run_items_attempt_id_app_eval_run_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."app_eval_run_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_run_comparisons" ADD CONSTRAINT "app_eval_run_comparisons_attempt_id_app_eval_run_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."app_eval_run_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
