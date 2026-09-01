-- Eval audio transcribe jobs no longer need shadow app_audios rows (eval_run_item_id only).
ALTER TABLE "app_audio_pipeline_jobs" ALTER COLUMN "audio_id" DROP NOT NULL;
--> statement-breakpoint
-- Remove orphan eval shadow audios not referenced by any pipeline job.
DELETE FROM "app_audios" a
WHERE COALESCE(a."metadata"->>'eval_shadow', 'false') = 'true'
  AND NOT EXISTS (
    SELECT 1 FROM "app_audio_pipeline_jobs" j WHERE j."audio_id" = a."id"
  );
--> statement-breakpoint
-- Drop empty system eval channel (no remaining audios).
DELETE FROM "app_audio_channels" c
WHERE c."name" = 'Evaluation (datasets)'
  AND NOT EXISTS (
    SELECT 1 FROM "app_audios" a WHERE a."channel_id" = c."id"
  );
