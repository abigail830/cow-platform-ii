-- Paddle pipeline: async job model with VLM args persisted on the job row.
ALTER TABLE "app_pipeline_jobs" ADD COLUMN IF NOT EXISTS "vlm_args" text;
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
	"description" = 'Paddle async: CLI run-async (local VLM parse → page index → metadata in one worker).',
	"command_template" = 'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy markdown-headings',
	"updated_at" = now()
WHERE "pipeline_name" = 'paddleocr-doc-parse';
