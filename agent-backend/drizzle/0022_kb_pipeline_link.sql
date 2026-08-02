ALTER TABLE "app_pipeline_configs" ADD COLUMN IF NOT EXISTS "workflow_file" text;
--> statement-breakpoint
ALTER TABLE "app_pipeline_configs" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_knowledge_bases" ADD COLUMN IF NOT EXISTS "pipeline_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_knowledge_bases"
  ADD CONSTRAINT "app_knowledge_bases_pipeline_id_app_pipeline_configs_id_fk"
  FOREIGN KEY ("pipeline_id") REFERENCES "public"."app_pipeline_configs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_bases_pipeline" ON "app_knowledge_bases" ("pipeline_id");
--> statement-breakpoint
ALTER TABLE "app_kb_import_jobs" ADD COLUMN IF NOT EXISTS "pipeline_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_kb_import_jobs"
  ADD CONSTRAINT "app_kb_import_jobs_pipeline_id_app_pipeline_configs_id_fk"
  FOREIGN KEY ("pipeline_id") REFERENCES "public"."app_pipeline_configs"("id") ON DELETE set null ON UPDATE no action;
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
  'PageIndex KB Import',
  'Imports parsed artifacts from object storage into PageIndex knowledge bases.',
  'kb-pageindex-import',
  'openkms-cli kb pageindex-import --job-id {job_id}',
  'openkms-kb-pageindex-import.yml',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_pipeline_configs"
  WHERE "pipeline_name" = 'kb-pageindex-import' AND "is_system" = true
);
--> statement-breakpoint
UPDATE "app_knowledge_bases" AS kb
SET "pipeline_id" = p."id"
FROM "app_pipeline_configs" AS p
WHERE kb."type" = 'page_index'
  AND kb."pipeline_id" IS NULL
  AND p."pipeline_name" = 'kb-pageindex-import'
  AND p."is_system" = true;
