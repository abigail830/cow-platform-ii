CREATE TABLE "app_builtin_agent_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"workflow_key" text NOT NULL,
	"api_type" text NOT NULL,
	"model_config_id" uuid NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"user_prompt_template" text DEFAULT '' NOT NULL,
	"output_mode" text DEFAULT 'text' NOT NULL,
	"output_schema" jsonb,
	"temperature" text,
	"max_tokens" integer,
	"is_system" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_builtin_agent_defs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app_workflow_bindings" (
	"workflow_key" text PRIMARY KEY NOT NULL,
	"builtin_agent_def_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_sync_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_key" text NOT NULL,
	"builtin_agent_def_id" uuid,
	"agent_def_version" integer,
	"trigger_type" text NOT NULL,
	"triggered_by" uuid,
	"resource_type" text,
	"resource_id" text,
	"status" text NOT NULL,
	"latency_ms" integer,
	"error_message" text,
	"input_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_sync_agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"token_usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD COLUMN "metadata_extraction_agent_def_id" uuid;
--> statement-breakpoint
ALTER TABLE "app_builtin_agent_defs" ADD CONSTRAINT "app_builtin_agent_defs_model_config_id_app_model_configs_id_fk" FOREIGN KEY ("model_config_id") REFERENCES "public"."app_model_configs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_workflow_bindings" ADD CONSTRAINT "app_workflow_bindings_builtin_agent_def_id_app_builtin_agent_defs_id_fk" FOREIGN KEY ("builtin_agent_def_id") REFERENCES "public"."app_builtin_agent_defs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_sync_agent_runs" ADD CONSTRAINT "app_sync_agent_runs_builtin_agent_def_id_app_builtin_agent_defs_id_fk" FOREIGN KEY ("builtin_agent_def_id") REFERENCES "public"."app_builtin_agent_defs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_sync_agent_runs" ADD CONSTRAINT "app_sync_agent_runs_triggered_by_app_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_sync_agent_messages" ADD CONSTRAINT "app_sync_agent_messages_run_id_app_sync_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."app_sync_agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_builtin_agent_defs_workflow" ON "app_builtin_agent_defs" USING btree ("workflow_key","updated_at");
--> statement-breakpoint
CREATE INDEX "idx_builtin_agent_defs_model" ON "app_builtin_agent_defs" USING btree ("model_config_id");
--> statement-breakpoint
CREATE INDEX "idx_sync_agent_runs_workflow" ON "app_sync_agent_runs" USING btree ("workflow_key","created_at");
--> statement-breakpoint
CREATE INDEX "idx_sync_agent_runs_triggered_by" ON "app_sync_agent_runs" USING btree ("triggered_by","created_at");
--> statement-breakpoint
CREATE INDEX "idx_sync_agent_messages_run" ON "app_sync_agent_messages" USING btree ("run_id");
