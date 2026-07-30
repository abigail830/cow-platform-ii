ALTER TABLE "app_document_channels"
ADD COLUMN IF NOT EXISTS "auto_start_pipeline" boolean NOT NULL DEFAULT false;
