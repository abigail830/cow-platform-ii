CREATE TABLE "app_kb_folder_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"auto_sync_enabled" boolean DEFAULT false NOT NULL,
	"sync_interval_minutes" integer DEFAULT 10 NOT NULL,
	"include_subfolders" boolean DEFAULT true NOT NULL,
	"last_auto_sync_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_kb_folder_sync_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"source_type" text,
	"source_id" text,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_kb_items" ADD COLUMN "sync_managed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_kb_chunk_documents" ADD COLUMN "sync_managed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_kb_folder_syncs" ADD CONSTRAINT "app_kb_folder_syncs_knowledge_base_id_app_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."app_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_kb_folder_syncs" ADD CONSTRAINT "app_kb_folder_syncs_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_kb_folder_sync_channels" ADD CONSTRAINT "app_kb_folder_sync_channels_sync_id_app_kb_folder_syncs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "public"."app_kb_folder_syncs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_kb_folder_sync_channels" ADD CONSTRAINT "app_kb_folder_sync_channels_channel_id_app_document_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_document_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_user_notifications" ADD CONSTRAINT "app_user_notifications_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_kb_folder_syncs_kb" ON "app_kb_folder_syncs" USING btree ("knowledge_base_id");
--> statement-breakpoint
CREATE INDEX "idx_kb_folder_syncs_auto" ON "app_kb_folder_syncs" USING btree ("auto_sync_enabled","last_auto_sync_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_kb_folder_sync_channels" ON "app_kb_folder_sync_channels" USING btree ("sync_id","channel_id");
--> statement-breakpoint
CREATE INDEX "idx_user_notifications_user" ON "app_user_notifications" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_user_notifications_unread" ON "app_user_notifications" USING btree ("user_id","read_at");
