ALTER TABLE "app_kb_items" ADD COLUMN IF NOT EXISTS "discovery_text" text;
--> statement-breakpoint
ALTER TABLE "app_kb_items" ADD COLUMN IF NOT EXISTS "toc_titles" jsonb;
--> statement-breakpoint
ALTER TABLE "app_kb_items" ADD COLUMN IF NOT EXISTS "page_count" integer;
--> statement-breakpoint
ALTER TABLE "app_kb_items" ADD COLUMN IF NOT EXISTS "page_index_strategy" text;
--> statement-breakpoint
ALTER TABLE "app_kb_items" ADD COLUMN IF NOT EXISTS "markdown_complete" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_kb_items" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
--> statement-breakpoint
UPDATE "app_kb_items"
SET "discovery_text" = trim(both FROM concat_ws(
  ' ',
  coalesce("document_name", ''),
  coalesce("channel_path", ''),
  coalesce("metadata"->>'abstract', ''),
  coalesce("metadata"->>'author', ''),
  coalesce("metadata"->>'source', ''),
  coalesce(
    (
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(coalesce("metadata"->'tags', '[]'::jsonb)) AS value
    ),
    ''
  ),
  coalesce(
    (
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(coalesce("metadata"->'categories', '[]'::jsonb)) AS value
    ),
    ''
  )
))
WHERE "discovery_text" IS NULL;
--> statement-breakpoint
UPDATE "app_kb_items"
SET "search_vector" = to_tsvector('simple', coalesce("discovery_text", ''))
WHERE "search_vector" IS NULL;
--> statement-breakpoint
UPDATE "app_kb_items"
SET "page_index_strategy" = "page_index"->>'strategy'
WHERE "page_index_strategy" IS NULL AND "page_index" IS NOT NULL;
--> statement-breakpoint
UPDATE "app_kb_items"
SET "page_count" = CASE
  WHEN ("parsing_result"->>'page_count') ~ '^[0-9]+$' THEN ("parsing_result"->>'page_count')::integer
  ELSE "page_count"
END
WHERE "page_count" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_items_search_vector"
  ON "app_kb_items" USING GIN ("search_vector");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_items_channel_path"
  ON "app_kb_items" ("channel_path");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_kb_items_sync_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.discovery_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_kb_items_search_vector ON "app_kb_items";
--> statement-breakpoint
CREATE TRIGGER trg_kb_items_search_vector
  BEFORE INSERT OR UPDATE OF discovery_text ON "app_kb_items"
  FOR EACH ROW
  EXECUTE FUNCTION app_kb_items_sync_search_vector();
