CREATE TABLE IF NOT EXISTS "app_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "license" text,
  "compatibility" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "origin" text NOT NULL,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE cascade,
  "source_s3_key" text,
  "import_status" text DEFAULT 'ready' NOT NULL,
  "import_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_skill_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "skill_id" uuid NOT NULL REFERENCES "app_skills"("id") ON DELETE cascade,
  "file_path" text NOT NULL,
  "content" bytea NOT NULL,
  "content_type" text DEFAULT 'text/plain' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_skills_origin" ON "app_skills" ("origin");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_skills_created_by" ON "app_skills" ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_skills_import_status" ON "app_skills" ("import_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_skills_slug" ON "app_skills" ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_app_skill_files_skill_path" ON "app_skill_files" ("skill_id", "file_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_skill_files_skill" ON "app_skill_files" ("skill_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_app_skills_platform_slug" ON "app_skills" ("slug") WHERE "origin" = 'platform';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_app_skills_user_slug" ON "app_skills" ("created_by", "slug") WHERE "origin" = 'user';
--> statement-breakpoint
ALTER TABLE "app_skills" ADD CONSTRAINT "app_skills_origin_check" CHECK ("origin" IN ('platform', 'user'));
--> statement-breakpoint
ALTER TABLE "app_skills" ADD CONSTRAINT "app_skills_import_status_check" CHECK ("import_status" IN ('pending', 'ready', 'failed'));
