ALTER TABLE "app_document_channels" ADD COLUMN IF NOT EXISTS "transcription_pipeline_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD COLUMN IF NOT EXISTS "post_process_pipeline_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD COLUMN IF NOT EXISTS "asr_vocabulary_id" text;
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD COLUMN IF NOT EXISTS "asr_vocabulary_target_model" text;
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD COLUMN IF NOT EXISTS "asr_vocabulary_synced_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_document_channels" ADD CONSTRAINT "app_document_channels_transcription_pipeline_id_app_pipeline_configs_id_fk" FOREIGN KEY ("transcription_pipeline_id") REFERENCES "public"."app_pipeline_configs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_document_channels" ADD CONSTRAINT "app_document_channels_post_process_pipeline_id_app_pipeline_configs_id_fk" FOREIGN KEY ("post_process_pipeline_id") REFERENCES "public"."app_pipeline_configs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_document_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"title" text NOT NULL,
	"brief" text,
	"participants_hint" text,
	"recording_mode" text,
	"audience" text DEFAULT 'unknown' NOT NULL,
	"input_mode" text DEFAULT 'document' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_captures_channel" ON "app_document_captures" USING btree ("channel_id","updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_document_capture_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"segment_index" integer DEFAULT 0 NOT NULL,
	"segment_label" text,
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
CREATE INDEX IF NOT EXISTS "idx_document_capture_segments_channel" ON "app_document_capture_segments" USING btree ("channel_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_capture_segments_capture" ON "app_document_capture_segments" USING btree ("capture_id","segment_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_capture_segments_hash" ON "app_document_capture_segments" USING btree ("file_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_document_capture_pipeline_jobs" (
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
CREATE INDEX IF NOT EXISTS "idx_document_capture_pipeline_jobs_capture" ON "app_document_capture_pipeline_jobs" USING btree ("capture_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_asr_hotword_document_channels" (
	"hotword_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_asr_hotword_document_channels_hotword_id_channel_id_pk" PRIMARY KEY("hotword_id","channel_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asr_hotword_document_channels_channel" ON "app_asr_hotword_document_channels" USING btree ("channel_id");
--> statement-breakpoint
ALTER TABLE "app_pipeline_jobs" ADD COLUMN IF NOT EXISTS "document_capture_segment_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_audio_pipeline_jobs" ADD COLUMN IF NOT EXISTS "document_capture_segment_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_document_captures" ADD CONSTRAINT "app_document_captures_channel_id_app_document_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_document_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_document_captures" ADD CONSTRAINT "app_document_captures_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_document_capture_segments" ADD CONSTRAINT "app_document_capture_segments_channel_id_app_document_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_document_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_document_capture_segments" ADD CONSTRAINT "app_document_capture_segments_capture_id_app_document_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."app_document_captures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_document_capture_segments" ADD CONSTRAINT "app_document_capture_segments_uploaded_by_app_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_document_capture_pipeline_jobs" ADD CONSTRAINT "app_document_capture_pipeline_jobs_capture_id_app_document_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."app_document_captures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_asr_hotword_document_channels" ADD CONSTRAINT "app_asr_hotword_document_channels_hotword_id_app_asr_hotwords_id_fk" FOREIGN KEY ("hotword_id") REFERENCES "public"."app_asr_hotwords"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_asr_hotword_document_channels" ADD CONSTRAINT "app_asr_hotword_document_channels_channel_id_app_document_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_document_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_pipeline_jobs" ADD CONSTRAINT "app_pipeline_jobs_document_capture_segment_id_app_document_capture_segments_id_fk" FOREIGN KEY ("document_capture_segment_id") REFERENCES "public"."app_document_capture_segments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_pipeline_jobs" ADD CONSTRAINT "app_audio_pipeline_jobs_document_capture_segment_id_app_document_capture_segments_id_fk" FOREIGN KEY ("document_capture_segment_id") REFERENCES "public"."app_document_capture_segments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
