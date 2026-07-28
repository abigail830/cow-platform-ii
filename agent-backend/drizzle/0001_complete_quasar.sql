CREATE TABLE "app_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"role" text,
	"content" text,
	"payload" jsonb,
	"turn_id" text,
	"tool_call_id" text,
	"operation_id" text,
	"flue_event_type" text,
	"flue_event_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_messages" ADD CONSTRAINT "app_messages_conversation_id_app_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."app_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_app_messages_conversation_seq" ON "app_messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_app_messages_conversation_flue_event" ON "app_messages" USING btree ("conversation_id","flue_event_index");