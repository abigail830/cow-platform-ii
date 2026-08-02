CREATE TABLE IF NOT EXISTS "app_resource_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"grantee_type" text NOT NULL,
	"grantee_user_id" uuid,
	"can_read" boolean DEFAULT false NOT NULL,
	"can_write" boolean DEFAULT false NOT NULL,
	"can_manage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_resource_grants_resource" ON "app_resource_grants" USING btree ("resource_type","resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_resource_grants_user" ON "app_resource_grants" USING btree ("grantee_user_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_resource_grants" ADD CONSTRAINT "app_resource_grants_grantee_user_id_app_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_resource_grants_unique_user" ON "app_resource_grants" ("resource_type", "resource_id", "grantee_user_id") WHERE "grantee_type" = 'user' AND "grantee_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_resource_grants_unique_others" ON "app_resource_grants" ("resource_type", "resource_id") WHERE "grantee_type" = 'others';
