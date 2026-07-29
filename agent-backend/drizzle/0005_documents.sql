CREATE TABLE "app_document_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"file_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"file_hash" text NOT NULL,
	"s3_key" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_document_channels" ADD CONSTRAINT "app_document_channels_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_documents" ADD CONSTRAINT "app_documents_channel_id_app_document_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_document_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_documents" ADD CONSTRAINT "app_documents_uploaded_by_app_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_document_channels_parent" ON "app_document_channels" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_documents_channel" ON "app_documents" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_documents_hash" ON "app_documents" USING btree ("file_hash");
