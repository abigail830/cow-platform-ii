ALTER TABLE "app_kb_import_jobs" DROP COLUMN IF EXISTS "document_results";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_kb_chunk_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "knowledge_base_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "document_name" text NOT NULL,
  "channel_path" text DEFAULT '' NOT NULL,
  "index_status" text DEFAULT 'pending' NOT NULL,
  "index_error" text,
  "indexed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_kb_chunk_documents"
  ADD CONSTRAINT "app_kb_chunk_documents_knowledge_base_id_app_knowledge_bases_id_fk"
  FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."app_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_kb_chunk_documents"
  ADD CONSTRAINT "app_kb_chunk_documents_document_id_app_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."app_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_kb_chunk_documents_kb_document" ON "app_kb_chunk_documents" ("knowledge_base_id","document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_chunk_documents_kb" ON "app_kb_chunk_documents" ("knowledge_base_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_chunk_documents_document" ON "app_kb_chunk_documents" ("document_id");
