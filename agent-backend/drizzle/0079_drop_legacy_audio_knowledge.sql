-- Drop legacy audio knowledge tables after unified document capture migration.

DELETE FROM "app_resource_grants" WHERE "resource_type" = 'audio_channel';

ALTER TABLE "app_audio_pipeline_jobs" DROP CONSTRAINT IF EXISTS "app_audio_pipeline_jobs_audio_id_app_audios_id_fk";

DROP TABLE IF EXISTS "app_asr_hotword_channels";
DROP TABLE IF EXISTS "app_audio_capture_pipeline_jobs";
DROP TABLE IF EXISTS "app_audios";
DROP TABLE IF EXISTS "app_audio_captures";
DROP TABLE IF EXISTS "app_audio_channels";

ALTER TABLE "app_audio_pipeline_jobs" DROP COLUMN IF EXISTS "audio_id";

DROP INDEX IF EXISTS "idx_audio_pipeline_jobs_audio";
CREATE INDEX IF NOT EXISTS "idx_audio_pipeline_jobs_segment" ON "app_audio_pipeline_jobs" USING btree ("document_capture_segment_id","created_at");
