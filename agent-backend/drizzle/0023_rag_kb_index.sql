CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "app_knowledge_bases" ADD COLUMN IF NOT EXISTS "embedding_model_config_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_knowledge_bases" ADD COLUMN IF NOT EXISTS "embedding_dimensions" integer DEFAULT 1024 NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_knowledge_bases" ADD COLUMN IF NOT EXISTS "chunk_config" jsonb DEFAULT '{"strategy":"markdown_header","chunk_size":8000,"chunk_overlap":50}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_knowledge_bases" ADD COLUMN IF NOT EXISTS "metadata_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_knowledge_bases"
  ADD CONSTRAINT "app_knowledge_bases_embedding_model_config_id_app_model_configs_id_fk"
  FOREIGN KEY ("embedding_model_config_id") REFERENCES "public"."app_model_configs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_bases_embedding_model" ON "app_knowledge_bases" ("embedding_model_config_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_kb_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "knowledge_base_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "embedding" vector NOT NULL,
  "chunk_metadata" jsonb,
  "doc_metadata" jsonb,
  "content_hash" text,
  "indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_kb_chunks"
  ADD CONSTRAINT "app_kb_chunks_knowledge_base_id_app_knowledge_bases_id_fk"
  FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."app_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_kb_chunks"
  ADD CONSTRAINT "app_kb_chunks_document_id_app_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."app_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_chunks_kb_document" ON "app_kb_chunks" ("knowledge_base_id", "document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_chunks_kb" ON "app_kb_chunks" ("knowledge_base_id", "indexed_at");
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
  'RAG KB Index',
  'Chunks markdown from object storage, embeds, and stores vectors for RAG knowledge bases.',
  'kb-rag-index',
  'openkms-cli kb rag-index --job-id {job_id}',
  'openkms-kb-rag-index.yml',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs"
  WHERE "pipeline_name" = 'kb-rag-index' AND "is_system" = true
);
--> statement-breakpoint
UPDATE "app_knowledge_bases" AS kb
SET "pipeline_id" = p."id"
FROM "app_pipeline_configs" AS p
WHERE kb."type" = 'rag'
  AND kb."pipeline_id" IS NULL
  AND p."pipeline_name" = 'kb-rag-index'
  AND p."is_system" = true;
