ALTER TABLE "app_audio_channels" ADD COLUMN IF NOT EXISTS "post_process_pipeline_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_audio_channels" ADD CONSTRAINT "app_audio_channels_post_process_pipeline_id_app_pipeline_configs_id_fk" FOREIGN KEY ("post_process_pipeline_id") REFERENCES "public"."app_pipeline_configs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
