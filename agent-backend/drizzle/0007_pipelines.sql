CREATE TABLE "app_pipeline_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"pipeline_name" text NOT NULL,
	"command_template" text NOT NULL,
	"model_config_id" uuid,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_pipeline_configs" ADD CONSTRAINT "app_pipeline_configs_model_config_id_app_model_configs_id_fk" FOREIGN KEY ("model_config_id") REFERENCES "public"."app_model_configs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_pipeline_configs_enabled" ON "app_pipeline_configs" USING btree ("is_enabled");
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD COLUMN "pipeline_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD CONSTRAINT "app_document_channels_pipeline_id_app_pipeline_configs_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."app_pipeline_configs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "app_pipeline_configs" (
	"name",
	"description",
	"pipeline_name",
	"command_template",
	"is_enabled"
) VALUES (
	'PaddleOCR Document Parse',
	'Parse documents using PaddleOCR-VL via openkms-cli',
	'paddleocr-doc-parse',
	'openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input {input} --s3-prefix {s3_prefix} --document-id {document_id} --api-url {api_url}{vlm_args}{extraction_args}',
	true
);
