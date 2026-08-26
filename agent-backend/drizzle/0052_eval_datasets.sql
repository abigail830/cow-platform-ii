CREATE TABLE IF NOT EXISTS "app_eval_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'test' NOT NULL,
	"media_type" text DEFAULT 'audio' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_datasets_updated" ON "app_eval_datasets" USING btree ("updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_eval_dataset_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dataset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"file_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"file_hash" text NOT NULL,
	"s3_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"reference_s3_key" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_dataset_items_dataset" ON "app_eval_dataset_items" USING btree ("dataset_id","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_eval_dataset_items_dataset_hash" ON "app_eval_dataset_items" USING btree ("dataset_id","file_hash");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_datasets" ADD CONSTRAINT "app_eval_datasets_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_dataset_items" ADD CONSTRAINT "app_eval_dataset_items_dataset_id_app_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."app_eval_datasets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_eval_dataset_items" ADD CONSTRAINT "app_eval_dataset_items_uploaded_by_app_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
