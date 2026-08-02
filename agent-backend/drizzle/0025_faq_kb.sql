CREATE TABLE IF NOT EXISTS "app_kb_faqs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "knowledge_base_id" uuid NOT NULL,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "source_type" text DEFAULT 'manual' NOT NULL,
  "source_document_id" uuid,
  "source_document_name" text,
  "publication_status" text DEFAULT 'draft' NOT NULL,
  "index_status" text,
  "index_error" text,
  "indexed_at" timestamp with time zone,
  "embedding" vector,
  "doc_metadata" jsonb,
  "content_hash" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_kb_faqs"
  ADD CONSTRAINT "app_kb_faqs_knowledge_base_id_app_knowledge_bases_id_fk"
  FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."app_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_kb_faqs"
  ADD CONSTRAINT "app_kb_faqs_source_document_id_app_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "public"."app_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_kb_faqs"
  ADD CONSTRAINT "app_kb_faqs_created_by_app_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_faqs_kb_status" ON "app_kb_faqs" ("knowledge_base_id", "publication_status", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_faqs_kb_index" ON "app_kb_faqs" ("knowledge_base_id", "index_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_faqs_source_document" ON "app_kb_faqs" ("source_document_id");
--> statement-breakpoint
ALTER TABLE "app_knowledge_bases" ADD COLUMN IF NOT EXISTS "faq_settings" jsonb DEFAULT '{"auto_index_on_publish":false,"extraction_model_config_id":null,"extraction_prompt":"Extract FAQ pairs from the document markdown below. Return a JSON array of objects with \"question\" and \"answer\" fields. Only include substantive Q&A from the content.\n\nDocument: {document_name}\n\n{markdown}","polish_model_config_id":null,"polish_prompt":"Polish the following FAQ answer for clarity and professionalism. Keep the same language as the input. Return only the polished answer text.\n\nQuestion: {question}\n\nAnswer: {answer}"}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_kb_import_jobs" ADD COLUMN IF NOT EXISTS "job_kind" text;
--> statement-breakpoint
ALTER TABLE "app_kb_import_jobs" ADD COLUMN IF NOT EXISTS "faq_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
INSERT INTO "app_pipeline_configs" (
  "name",
  "description",
  "pipeline_name",
  "command_template",
  "workflow_file",
  "is_enabled",
  "is_system"
)
SELECT
  'FAQ KB Index',
  'Embeds published FAQ questions and stores vectors for FAQ knowledge bases.',
  'kb-faq-index',
  'openkms-cli kb faq-index --job-id {job_id}',
  'openkms-kb-faq-index.yml',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs"
  WHERE "pipeline_name" = 'kb-faq-index' AND "is_system" = true
);
--> statement-breakpoint
INSERT INTO "app_pipeline_configs" (
  "name",
  "description",
  "pipeline_name",
  "command_template",
  "workflow_file",
  "is_enabled",
  "is_system"
)
SELECT
  'FAQ KB Extract',
  'Extracts FAQ drafts from document markdown using configured LLM.',
  'kb-faq-extract',
  'openkms-cli kb faq-extract --job-id {job_id}',
  'openkms-kb-faq-extract.yml',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs"
  WHERE "pipeline_name" = 'kb-faq-extract' AND "is_system" = true
);
--> statement-breakpoint
UPDATE "app_knowledge_bases" AS kb
SET "pipeline_id" = p."id"
FROM "app_pipeline_configs" AS p
WHERE kb."type" = 'faq'
  AND kb."pipeline_id" IS NULL
  AND p."pipeline_name" = 'kb-faq-index'
  AND p."is_system" = true;
