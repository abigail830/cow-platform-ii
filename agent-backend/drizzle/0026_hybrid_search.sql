CREATE TABLE IF NOT EXISTS "app_user_preferences" (
  "user_id" uuid NOT NULL,
  "pref_key" text NOT NULL,
  "pref_value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_user_preferences_user_id_app_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade,
  CONSTRAINT "app_user_preferences_user_id_pref_key_pk" PRIMARY KEY("user_id","pref_key")
);
--> statement-breakpoint
ALTER TABLE "app_kb_chunks" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
--> statement-breakpoint
ALTER TABLE "app_kb_faqs" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
--> statement-breakpoint
UPDATE "app_kb_chunks"
SET "search_vector" = to_tsvector('simple', coalesce("content", ''))
WHERE "search_vector" IS NULL;
--> statement-breakpoint
UPDATE "app_kb_faqs"
SET "search_vector" = to_tsvector('simple', coalesce("question", '') || ' ' || coalesce("answer", ''))
WHERE "search_vector" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_chunks_search_vector"
  ON "app_kb_chunks" USING GIN ("search_vector");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_faqs_search_vector"
  ON "app_kb_faqs" USING GIN ("search_vector");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_kb_chunks_sync_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_kb_chunks_search_vector ON "app_kb_chunks";
--> statement-breakpoint
CREATE TRIGGER trg_kb_chunks_search_vector
  BEFORE INSERT OR UPDATE OF content ON "app_kb_chunks"
  FOR EACH ROW
  EXECUTE FUNCTION app_kb_chunks_sync_search_vector();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_kb_faqs_sync_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.question, '') || ' ' || coalesce(NEW.answer, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_kb_faqs_search_vector ON "app_kb_faqs";
--> statement-breakpoint
CREATE TRIGGER trg_kb_faqs_search_vector
  BEFORE INSERT OR UPDATE OF question, answer ON "app_kb_faqs"
  FOR EACH ROW
  EXECUTE FUNCTION app_kb_faqs_sync_search_vector();
