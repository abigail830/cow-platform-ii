ALTER TABLE "app_document_channels" ADD COLUMN "metadata_extraction_model_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD CONSTRAINT "app_document_channels_metadata_extraction_model_id_app_model_configs_id_fk" FOREIGN KEY ("metadata_extraction_model_id") REFERENCES "public"."app_model_configs"("id") ON DELETE set null ON UPDATE no action;
