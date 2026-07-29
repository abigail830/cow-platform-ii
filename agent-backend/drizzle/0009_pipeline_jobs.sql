CREATE TABLE "app_pipeline_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"pipeline_name" text NOT NULL,
	"provider" text NOT NULL,
	"stage" text DEFAULT 'submitted' NOT NULL,
	"external_job_id" text,
	"extraction_args" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_pipeline_jobs" ADD CONSTRAINT "app_pipeline_jobs_document_id_app_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."app_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_pipeline_jobs_document" ON "app_pipeline_jobs" USING btree ("document_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_pipeline_jobs_stage" ON "app_pipeline_jobs" USING btree ("stage","provider");
--> statement-breakpoint
INSERT INTO "app_pipeline_configs" (
	"name",
	"description",
	"pipeline_name",
	"command_template",
	"is_enabled"
)
SELECT
	'Aliyun Document Mind Parse',
	'Parse via Aliyun Document Mind (大模型版): async submit → poll → finalize. Page index uses aliyun-layouts strategy.',
	'aliyun-docmind-parse',
	E'openkms-cli pipeline submit --job-id {job_id}\nopenkms-cli pipeline finalize --job-id {job_id} --page-index-strategy aliyun-layouts',
	true
WHERE NOT EXISTS (
	SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'aliyun-docmind-parse'
);
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
	"command_template" = 'openkms-cli pipeline submit --job-id {job_id}',
	"description" = 'Parse via Baidu Cloud API; async job stages (submit → poll → finalize).'
WHERE "pipeline_name" = 'baidu-doc-parse';
