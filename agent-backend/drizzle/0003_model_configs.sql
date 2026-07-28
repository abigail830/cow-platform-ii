CREATE TABLE "app_model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"api_type" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_url" text,
	"api_key" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"extra_config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_model_configs_api_type" ON "app_model_configs" USING btree ("api_type");--> statement-breakpoint
CREATE INDEX "idx_model_configs_provider" ON "app_model_configs" USING btree ("provider");
