ALTER TABLE "app_document_captures" RENAME COLUMN "brief" TO "abstract";--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = REPLACE(REPLACE("config_yaml", 'Brief: {brief}', 'Abstract: {abstract}'), '{brief}', '{abstract}'),
  "updated_at" = NOW()
WHERE "pipeline_name" = 'audio-capture-post-process'
  AND "config_yaml" IS NOT NULL
  AND "config_yaml" LIKE '%{brief}%';--> statement-breakpoint
UPDATE "app_document_capture_pipeline_jobs"
SET
  "config_yaml" = REPLACE(REPLACE("config_yaml", 'Brief: {brief}', 'Abstract: {abstract}'), '{brief}', '{abstract}'),
  "updated_at" = NOW()
WHERE "config_yaml" IS NOT NULL
  AND "config_yaml" LIKE '%{brief}%';
