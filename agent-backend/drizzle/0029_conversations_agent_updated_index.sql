CREATE INDEX "idx_conversations_agent_updated" ON "app_conversations" USING btree ("agent_name","updated_at");
