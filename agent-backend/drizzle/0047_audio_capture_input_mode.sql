ALTER TABLE "app_audio_captures" ADD COLUMN IF NOT EXISTS "input_mode" text DEFAULT 'audio' NOT NULL;
