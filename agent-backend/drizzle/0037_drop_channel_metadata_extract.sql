ALTER TABLE "app_document_channels" DROP CONSTRAINT IF EXISTS "app_document_channels_metadata_extraction_model_id_app_model_configs_id_fk";--> statement-breakpoint
ALTER TABLE "app_document_channels" DROP COLUMN IF EXISTS "metadata_extraction_model_id";--> statement-breakpoint
ALTER TABLE "app_document_channels" DROP COLUMN IF EXISTS "metadata_extraction_agent_def_id";
