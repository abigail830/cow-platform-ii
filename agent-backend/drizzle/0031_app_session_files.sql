CREATE TABLE IF NOT EXISTS "app_session_files" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_backend" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_cache_key" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_files_instance" ON "app_session_files" USING btree ("instance_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_files_expires" ON "app_session_files" USING btree ("expires_at");
