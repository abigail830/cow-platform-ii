CREATE TABLE IF NOT EXISTS "app_knowledge_bases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "type" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_kb_import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "knowledge_base_id" uuid NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "total_count" integer DEFAULT 0 NOT NULL,
  "completed_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_kb_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "knowledge_base_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "document_name" text NOT NULL,
  "channel_path" text DEFAULT '' NOT NULL,
  "original_s3_key" text NOT NULL,
  "metadata" jsonb,
  "page_index" jsonb,
  "markdown" text,
  "parsing_result" jsonb,
  "import_status" text DEFAULT 'pending' NOT NULL,
  "import_error" text,
  "import_warnings" jsonb,
  "imported_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "app_knowledge_bases"
  ADD CONSTRAINT "app_knowledge_bases_created_by_app_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "app_kb_import_jobs"
  ADD CONSTRAINT "app_kb_import_jobs_knowledge_base_id_app_knowledge_bases_id_fk"
  FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."app_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "app_kb_import_jobs"
  ADD CONSTRAINT "app_kb_import_jobs_created_by_app_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "app_kb_items"
  ADD CONSTRAINT "app_kb_items_knowledge_base_id_app_knowledge_bases_id_fk"
  FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."app_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "app_kb_items"
  ADD CONSTRAINT "app_kb_items_document_id_app_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."app_documents"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_knowledge_bases_type" ON "app_knowledge_bases" ("type", "updated_at");
CREATE INDEX IF NOT EXISTS "idx_kb_import_jobs_kb" ON "app_kb_import_jobs" ("knowledge_base_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_kb_import_jobs_status" ON "app_kb_import_jobs" ("status", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_kb_items_kb_document" ON "app_kb_items" ("knowledge_base_id", "document_id");
CREATE INDEX IF NOT EXISTS "idx_kb_items_kb" ON "app_kb_items" ("knowledge_base_id", "imported_at");
CREATE INDEX IF NOT EXISTS "idx_kb_items_document" ON "app_kb_items" ("document_id");
