CREATE TABLE IF NOT EXISTS "app_audio_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"title" text NOT NULL,
	"brief" text,
	"participants_hint" text,
	"recording_mode" text,
	"audience" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audio_captures_channel" ON "app_audio_captures" USING btree ("channel_id","updated_at");
--> statement-breakpoint
ALTER TABLE "app_audios" ADD COLUMN IF NOT EXISTS "capture_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_audios" ADD COLUMN IF NOT EXISTS "segment_index" integer;
--> statement-breakpoint
ALTER TABLE "app_audios" ADD COLUMN IF NOT EXISTS "segment_label" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audios_capture" ON "app_audios" USING btree ("capture_id","segment_index");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_audio_capture_pipeline_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_id" uuid NOT NULL,
	"pipeline_name" text NOT NULL,
	"stage" text DEFAULT 'submitted' NOT NULL,
	"config_yaml" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audio_capture_pipeline_jobs_capture" ON "app_audio_capture_pipeline_jobs" USING btree ("capture_id","created_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_captures" ADD CONSTRAINT "app_audio_captures_channel_id_app_audio_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_audio_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_captures" ADD CONSTRAINT "app_audio_captures_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audios" ADD CONSTRAINT "app_audios_capture_id_app_audio_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."app_audio_captures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_capture_pipeline_jobs" ADD CONSTRAINT "app_audio_capture_pipeline_jobs_capture_id_app_audio_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."app_audio_captures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "app_pipeline_configs" (
	"name",
	"description",
	"pipeline_name",
	"command_template",
	"workflow_file",
	"is_enabled",
	"is_system"
)
SELECT
	'Audio Capture Post-Process',
	'Merge segment transcripts, structure, classify, and extract knowledge artifacts.',
	'audio-capture-post-process',
	'openkms-cli audio-capture post-process --job-id {job_id}',
	'openkms-audio-capture-post-process.yml',
	true,
	true
WHERE NOT EXISTS (
	SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'audio-capture-post-process'
);
