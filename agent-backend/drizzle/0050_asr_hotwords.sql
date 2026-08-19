CREATE TABLE IF NOT EXISTS "app_asr_hotwords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"weight" integer DEFAULT 4 NOT NULL,
	"lang" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asr_hotwords_text" ON "app_asr_hotwords" USING btree ("text");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_asr_hotword_channels" (
	"hotword_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_asr_hotword_channels_hotword_id_channel_id_pk" PRIMARY KEY("hotword_id","channel_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asr_hotword_channels_channel" ON "app_asr_hotword_channels" USING btree ("channel_id");
--> statement-breakpoint
ALTER TABLE "app_audio_channels" ADD COLUMN IF NOT EXISTS "asr_vocabulary_id" text;
--> statement-breakpoint
ALTER TABLE "app_audio_channels" ADD COLUMN IF NOT EXISTS "asr_vocabulary_target_model" text;
--> statement-breakpoint
ALTER TABLE "app_audio_channels" ADD COLUMN IF NOT EXISTS "asr_vocabulary_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "app_audio_pipeline_jobs" ADD COLUMN IF NOT EXISTS "asr_vocabulary_id_snapshot" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_asr_hotwords" ADD CONSTRAINT "app_asr_hotwords_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_asr_hotword_channels" ADD CONSTRAINT "app_asr_hotword_channels_hotword_id_app_asr_hotwords_id_fk" FOREIGN KEY ("hotword_id") REFERENCES "public"."app_asr_hotwords"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_asr_hotword_channels" ADD CONSTRAINT "app_asr_hotword_channels_channel_id_app_audio_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_audio_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
