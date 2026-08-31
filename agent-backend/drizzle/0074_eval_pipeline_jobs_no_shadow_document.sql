-- Eval document parse jobs no longer need shadow app_documents rows (eval_run_item_id only).
ALTER TABLE "app_pipeline_jobs" ALTER COLUMN "document_id" DROP NOT NULL;
--> statement-breakpoint
-- Remove orphan eval shadow documents not referenced by any pipeline job.
DELETE FROM "app_documents" d
WHERE COALESCE(d."metadata"->>'eval_shadow', 'false') = 'true'
  AND NOT EXISTS (
    SELECT 1 FROM "app_pipeline_jobs" j WHERE j."document_id" = d."id"
  );
--> statement-breakpoint
-- Drop empty system eval channel (no remaining documents).
DELETE FROM "app_document_channels" c
WHERE c."name" = 'Evaluation (datasets)'
  AND NOT EXISTS (
    SELECT 1 FROM "app_documents" d WHERE d."channel_id" = c."id"
  );
