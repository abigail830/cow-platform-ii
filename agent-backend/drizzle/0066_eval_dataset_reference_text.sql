-- Store eval dataset ground-truth reference transcripts in PostgreSQL (not OSS).
ALTER TABLE "app_eval_dataset_items" ADD COLUMN IF NOT EXISTS "reference_text" text;
--> statement-breakpoint
ALTER TABLE "app_eval_dataset_items" DROP COLUMN IF EXISTS "reference_s3_key";
