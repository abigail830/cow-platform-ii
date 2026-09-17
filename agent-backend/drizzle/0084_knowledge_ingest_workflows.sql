CREATE TABLE "app_webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"signature_mode" text DEFAULT 'hmac_sha256' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"sequence" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"response_status" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_knowledge_ingest_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"channel_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"knowledge_base_type" text DEFAULT 'rag' NOT NULL,
	"webhook_subscription_id" uuid,
	"steps" jsonb DEFAULT '["upload","process","index"]'::jsonb NOT NULL,
	"retry_config" jsonb DEFAULT '{"max_attempts":2,"auto_retry":true}'::jsonb NOT NULL,
	"parallelism" jsonb DEFAULT '{"process":3,"index":1}'::jsonb NOT NULL,
	"index_mode" text DEFAULT 'batch' NOT NULL,
	"index_content" jsonb DEFAULT '{"audio":"combined"}'::jsonb NOT NULL,
	"upload_deadline_at" timestamp with time zone,
	"idempotency_key" text,
	"error_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_knowledge_ingest_workflow_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"client_ref" text NOT NULL,
	"detected_type" text NOT NULL,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"step" text DEFAULT 'upload' NOT NULL,
	"capture_id" uuid NOT NULL,
	"document_id" uuid,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"job_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_webhook_deliveries" ADD CONSTRAINT "app_webhook_deliveries_subscription_id_app_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."app_webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_knowledge_ingest_workflows" ADD CONSTRAINT "app_knowledge_ingest_workflows_channel_id_app_document_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."app_document_channels"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_knowledge_ingest_workflows" ADD CONSTRAINT "app_knowledge_ingest_workflows_knowledge_base_id_app_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."app_knowledge_bases"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_knowledge_ingest_workflows" ADD CONSTRAINT "app_knowledge_ingest_workflows_webhook_subscription_id_app_webhook_subscriptions_id_fk" FOREIGN KEY ("webhook_subscription_id") REFERENCES "public"."app_webhook_subscriptions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_knowledge_ingest_workflows" ADD CONSTRAINT "app_knowledge_ingest_workflows_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_knowledge_ingest_workflow_items" ADD CONSTRAINT "app_knowledge_ingest_workflow_items_workflow_id_app_knowledge_ingest_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."app_knowledge_ingest_workflows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_knowledge_ingest_workflow_items" ADD CONSTRAINT "app_knowledge_ingest_workflow_items_capture_id_app_document_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."app_document_captures"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_knowledge_ingest_workflow_items" ADD CONSTRAINT "app_knowledge_ingest_workflow_items_document_id_app_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."app_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_webhook_subscriptions_owner" ON "app_webhook_subscriptions" USING btree ("owner_type","owner_id");
--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_subscription" ON "app_webhook_deliveries" USING btree ("subscription_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_ingest_workflows_status" ON "app_knowledge_ingest_workflows" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "idx_ingest_workflows_deadline" ON "app_knowledge_ingest_workflows" USING btree ("upload_deadline_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ingest_workflows_idempotency" ON "app_knowledge_ingest_workflows" USING btree ("created_by","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ingest_workflow_items_client_ref" ON "app_knowledge_ingest_workflow_items" USING btree ("workflow_id","client_ref");
--> statement-breakpoint
CREATE INDEX "idx_ingest_workflow_items_capture" ON "app_knowledge_ingest_workflow_items" USING btree ("capture_id");
--> statement-breakpoint
CREATE INDEX "idx_ingest_workflow_items_status" ON "app_knowledge_ingest_workflow_items" USING btree ("workflow_id","status");
