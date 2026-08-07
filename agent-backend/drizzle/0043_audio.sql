CREATE TABLE IF NOT EXISTS "app_audio_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"pipeline_id" uuid,
	"auto_start_pipeline" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audio_channels_parent" ON "app_audio_channels" USING btree ("parent_id","sort_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_audios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"file_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"file_hash" text NOT NULL,
	"s3_key" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"duration_sec" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audios_channel" ON "app_audios" USING btree ("channel_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audios_hash" ON "app_audios" USING btree ("file_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_audio_pipeline_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audio_id" uuid NOT NULL,
	"pipeline_name" text NOT NULL,
	"provider" text NOT NULL,
	"stage" text DEFAULT 'submitted' NOT NULL,
	"external_job_id" text,
	"config_yaml" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audio_pipeline_jobs_audio" ON "app_audio_pipeline_jobs" USING btree ("audio_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audio_pipeline_jobs_stage" ON "app_audio_pipeline_jobs" USING btree ("stage","provider");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_channels" ADD CONSTRAINT "app_audio_channels_pipeline_id_app_pipeline_configs_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."app_pipeline_configs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_channels" ADD CONSTRAINT "app_audio_channels_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audios" ADD CONSTRAINT "app_audios_channel_id_app_audio_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_audio_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audios" ADD CONSTRAINT "app_audios_uploaded_by_app_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_pipeline_jobs" ADD CONSTRAINT "app_audio_pipeline_jobs_audio_id_app_audios_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."app_audios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "app_pipeline_configs" (
	"name",
	"description",
	"pipeline_name",
	"command_template",
	"is_enabled",
	"is_system"
)
SELECT
	'Aliyun Qwen-Audio Transcribe',
	'Transcribe audio via DashScope Qwen-Audio-3.0 file transcription API.',
	'aliyun-qwen-audio-transcribe',
	'openkms-cli audio-pipeline run-async --job-id {job_id}',
	true,
	true
WHERE NOT EXISTS (
	SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'aliyun-qwen-audio-transcribe'
);
