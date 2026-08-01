CREATE TABLE IF NOT EXISTS "app_e2b_sessions" (
  "instance_id" text PRIMARY KEY NOT NULL,
  "sandbox_id" text NOT NULL,
  "agent_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_e2b_sessions_updated" ON "app_e2b_sessions" ("updated_at");
