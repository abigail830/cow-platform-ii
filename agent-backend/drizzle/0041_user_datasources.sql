CREATE TABLE "app_user_datasources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"display_title" text,
	"type" text NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"username" text NOT NULL,
	"database" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"ssl" boolean DEFAULT false NOT NULL,
	"readonly" boolean DEFAULT true NOT NULL,
	"max_rows" integer DEFAULT 100 NOT NULL,
	"statement_timeout_ms" integer DEFAULT 30000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_studio_agents" ADD COLUMN "datasource_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_user_datasources" ADD CONSTRAINT "app_user_datasources_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_user_datasources_created_by" ON "app_user_datasources" USING btree ("created_by");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_datasources_owner_name" ON "app_user_datasources" USING btree ("created_by","name");
