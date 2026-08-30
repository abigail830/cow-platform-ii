-- Per-run ASR hotwords for fair multi-pipeline eval; snapshotted per attempt at start.
ALTER TABLE "app_eval_runs" ADD COLUMN IF NOT EXISTS "asr_hotwords" jsonb;
--> statement-breakpoint
ALTER TABLE "app_eval_run_attempts" ADD COLUMN IF NOT EXISTS "asr_hotwords_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "app_eval_run_attempts" ADD COLUMN IF NOT EXISTS "asr_vocabulary_by_pipeline" jsonb;
