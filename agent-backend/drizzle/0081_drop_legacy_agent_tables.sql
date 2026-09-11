-- Phase 3: drop legacy agent playground / studio / skill persistence and Flue 0.11 tables.
-- Builtin sync agent tables (app_builtin_agent_defs, app_workflow_bindings, app_sync_agent_*) are retained.

DELETE FROM "app_resource_grants" WHERE "resource_type" IN ('studio_agent', 'skill');

DROP TABLE IF EXISTS "app_skill_files" CASCADE;
DROP TABLE IF EXISTS "app_skills" CASCADE;
DROP TABLE IF EXISTS "app_studio_agents" CASCADE;
DROP TABLE IF EXISTS "app_user_mcp_servers" CASCADE;
DROP TABLE IF EXISTS "app_user_mcp_credentials" CASCADE;
DROP TABLE IF EXISTS "app_user_datasources" CASCADE;
DROP TABLE IF EXISTS "app_agent_permissions" CASCADE;
DROP TABLE IF EXISTS "app_conversations" CASCADE;
DROP TABLE IF EXISTS "app_e2b_sessions" CASCADE;
DROP TABLE IF EXISTS "app_session_files" CASCADE;

DROP TABLE IF EXISTS "flue_event_stream_entries" CASCADE;
DROP TABLE IF EXISTS "flue_event_streams" CASCADE;
DROP TABLE IF EXISTS "flue_run_registry" CASCADE;
DROP TABLE IF EXISTS "flue_runs" CASCADE;
DROP TABLE IF EXISTS "flue_agent_dispatch_receipts" CASCADE;
DROP TABLE IF EXISTS "flue_agent_session_deletions" CASCADE;
DROP TABLE IF EXISTS "flue_agent_stream_chunks" CASCADE;
DROP TABLE IF EXISTS "flue_agent_turn_journals" CASCADE;
DROP TABLE IF EXISTS "flue_agent_submissions" CASCADE;
DROP TABLE IF EXISTS "flue_session_entries" CASCADE;
DROP TABLE IF EXISTS "flue_sessions" CASCADE;
DROP TABLE IF EXISTS "flue_conversation_stream_batches" CASCADE;
DROP TABLE IF EXISTS "flue_conversation_streams" CASCADE;
DROP TABLE IF EXISTS "flue_schema_meta" CASCADE;
DROP TABLE IF EXISTS "flue_attachments" CASCADE;
DROP TABLE IF EXISTS "flue_meta" CASCADE;
