CREATE TABLE "app_studio_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_by" uuid NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"model_config_id" uuid NOT NULL,
	"thinking_level" text,
	"skill_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platform_mcp_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"private_mcp_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sandbox" jsonb DEFAULT '{"provider":"none"}'::jsonb NOT NULL,
	"a2a" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_studio_agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app_user_mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"config" jsonb NOT NULL,
	"secrets" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user_mcp_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform_mcp_id" text NOT NULL,
	"secrets" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_studio_agents" ADD CONSTRAINT "app_studio_agents_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_studio_agents" ADD CONSTRAINT "app_studio_agents_model_config_id_app_model_configs_id_fk" FOREIGN KEY ("model_config_id") REFERENCES "public"."app_model_configs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_user_mcp_servers" ADD CONSTRAINT "app_user_mcp_servers_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_user_mcp_credentials" ADD CONSTRAINT "app_user_mcp_credentials_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_studio_agents_created_by" ON "app_studio_agents" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "idx_studio_agents_updated" ON "app_studio_agents" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX "idx_user_mcp_servers_created_by" ON "app_user_mcp_servers" USING btree ("created_by");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_mcp_servers_owner_name" ON "app_user_mcp_servers" USING btree ("created_by","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_mcp_credentials_user_platform" ON "app_user_mcp_credentials" USING btree ("user_id","platform_mcp_id");
