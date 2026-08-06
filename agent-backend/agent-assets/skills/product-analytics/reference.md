# Platform DB reference — product analytics

Read-only analytics against the OKF application PostgreSQL schema (`app_*` + `flue_*`).

## Entity relationships (high level)

```
app_users
  ├── app_conversations (user_id, agent_name)
  ├── app_documents / app_knowledge_bases (created_by, uploaded_by)
  ├── app_user_api_keys, app_user_roles, app_user_preferences
  └── app_user_datasources, app_user_mcp_servers

app_conversations.id  ↔  conversation id inside flue session paths
flue_conversation_streams.path  ↔  agent conversation stream
flue_conversation_stream_batches  ↔  message content (large; avoid full scans)
flue_agent_submissions.session_key  ↔  per-turn metadata (latency, status)

app_document_channels → app_documents → app_pipeline_jobs
app_knowledge_bases → app_kb_items / app_kb_chunks / app_kb_faqs / app_kb_import_jobs
```

## App tables (`app_*`)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `app_users` | Accounts | `email`, `display_name`, `role`, `created_at` |
| `app_user_roles` | RBAC roles | `user_id`, `role_id` |
| `app_roles` | Role catalog | `key`, `label` |
| `app_agent_permissions` | Per-user agent allowlist | `user_id`, `agent_name` |
| `app_conversations` | Playground session index | `user_id`, `agent_name`, `title`, `created_at`, `updated_at` |
| `app_session_files` | Uploaded session attachments | `agent_name`, `mime_type`, `size_bytes`, `instance_id` |
| `app_e2b_sessions` | Sandbox leases | `agent_name`, `instance_id`, `updated_at` |
| `app_user_api_keys` | Programmatic API keys | `last_used_at`, `revoked_at`, `created_at` |
| `app_user_preferences` | User prefs | `pref_key`, `pref_value` (jsonb) |
| `app_document_channels` | Doc channel tree | `parent_id`, `pipeline_id`, `auto_start_pipeline`, `created_by` |
| `app_documents` | Uploaded files | `channel_id`, `file_type`, `size_bytes`, `status`, `uploaded_by`, `file_hash` |
| `app_pipeline_configs` | Pipeline definitions | `pipeline_name`, `is_enabled`, `is_system` |
| `app_pipeline_jobs` | Per-doc parse jobs | `document_id`, `provider`, `stage`, `error_message` |
| `app_knowledge_bases` | KB registry | `type` (page_index/rag/faq), `created_by`, `pipeline_id` |
| `app_kb_items` | PageIndex items | `knowledge_base_id`, `document_id`, `import_status` |
| `app_kb_chunks` | RAG vectors | `knowledge_base_id`, `document_id`, `indexed_at` |
| `app_kb_chunk_documents` | RAG per-doc index status | `index_status`, `indexed_at` |
| `app_kb_faqs` | FAQ entries | `publication_status`, `source_type`, `index_status` |
| `app_kb_import_jobs` | Bulk import jobs | `job_kind`, `status`, `total_count`, `failed_count` |
| `app_sync_agent_runs` | Builtin workflow runs | `workflow_key`, `trigger_type`, `status`, `latency_ms` |
| `app_sync_agent_messages` | Run messages | `run_id`, `token_usage` (jsonb) |
| `app_studio_agents` | User/platform studio agents | `origin`, `skill_ids`, `platform_mcp_ids`, `datasource_ids` |
| `app_user_mcp_servers` | Private MCP configs | `created_by`, `name` |
| `app_user_datasources` | User DB connections | `type`, `name`, `readonly` |
| `app_resource_grants` | Resource ACL | `resource_type`, `resource_id`, `grantee_user_id`, `can_read/write/manage` |
| `app_model_configs` | LLM configs | `provider`, `api_type`, `is_default` |
| `app_builtin_agent_defs` | Workflow agent defs | `workflow_key`, `slug` |

## Flue persistence (`flue_*`)

| Table | Purpose | Notes |
|-------|---------|-------|
| `flue_conversation_streams` | Stream registry | `path` encodes agent + instance |
| `flue_conversation_stream_batches` | Message batches | Large; use only for content mining |
| `flue_agent_submissions` | Agent turn pipeline | `session_key`, `status`, `accepted_at`, `settled_at` (epoch ms), `error`, `attempt_count` |
| `flue_attachments` | Binary attachment refs | |
| `flue_meta` | Flue schema version | |

### Parsing `session_key`

Example: `agent-session:["user-uuid--conv-uuid","default","default"]`

Extract conversation id (second segment of composite id before `--` is user, after is conversation):

```sql
SELECT
  substring(session_key from '--([^"]+)') AS conversation_id_fragment
FROM flue_agent_submissions
LIMIT 5;
```

Prefer joining via `app_conversations` when you need `agent_name` or `user_id`.

### Submission timestamps

```sql
(to_timestamp(accepted_at::bigint / 1000.0)) AT TIME ZONE 'UTC' AS accepted_ts
```

## Starter queries

### Registered users by week

```sql
SELECT date_trunc('week', created_at) AS week, COUNT(*) AS new_users
FROM app_users
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12
```

### Active users (conversations updated, last 30 days)

```sql
SELECT COUNT(DISTINCT user_id) AS active_users
FROM app_conversations
WHERE updated_at >= NOW() - INTERVAL '30 days'
```

### Conversations by agent (last 30 days)

```sql
SELECT agent_name, COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS users
FROM app_conversations
WHERE updated_at >= NOW() - INTERVAL '30 days'
GROUP BY agent_name
ORDER BY sessions DESC
```

### Daily session trend

```sql
SELECT date_trunc('day', created_at) AS day, COUNT(*) AS new_sessions
FROM app_conversations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1
```

### Turn volume and median latency by day

```sql
SELECT
  date_trunc('day', to_timestamp(accepted_at::bigint / 1000.0)) AS day,
  COUNT(*) AS turns,
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY (settled_at::bigint - accepted_at::bigint)
  ) AS median_latency_ms
FROM flue_agent_submissions
WHERE status = 'settled'
  AND accepted_at IS NOT NULL
  AND settled_at IS NOT NULL
  AND to_timestamp(accepted_at::bigint / 1000.0) >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1
```

### Submission failure rate

```sql
SELECT
  status,
  COUNT(*) AS cnt,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM flue_agent_submissions
WHERE to_timestamp(accepted_at::bigint / 1000.0) >= NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY cnt DESC
```

### Documents by status and type

```sql
SELECT status, file_type, COUNT(*) AS docs, SUM(size_bytes) AS total_bytes
FROM app_documents
GROUP BY status, file_type
ORDER BY docs DESC
```

### Knowledge bases by type

```sql
SELECT type, COUNT(*) AS kb_count
FROM app_knowledge_bases
GROUP BY type
```

### KB import job health

```sql
SELECT status, job_kind, COUNT(*) AS jobs,
  SUM(failed_count) AS total_failed_items
FROM app_kb_import_jobs
GROUP BY status, job_kind
ORDER BY jobs DESC
```

### Pipeline job stages by provider

```sql
SELECT provider, stage, COUNT(*) AS jobs
FROM app_pipeline_jobs
GROUP BY provider, stage
ORDER BY jobs DESC
```

### Sync workflow runs

```sql
SELECT workflow_key, trigger_type, status, COUNT(*) AS runs,
  ROUND(AVG(latency_ms)) AS avg_latency_ms
FROM app_sync_agent_runs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY workflow_key, trigger_type, status
ORDER BY runs DESC
```

### Studio builder adoption

```sql
SELECT origin, COUNT(*) AS agents,
  MAX(updated_at) AS last_updated
FROM app_studio_agents
GROUP BY origin
```

### API key adoption

```sql
SELECT
  COUNT(*) FILTER (WHERE revoked_at IS NULL) AS active_keys,
  COUNT(*) FILTER (WHERE last_used_at IS NOT NULL) AS ever_used,
  COUNT(*) FILTER (WHERE last_used_at >= NOW() - INTERVAL '30 days') AS used_last_30d
FROM app_user_api_keys
```

### Resource grants by type

```sql
SELECT resource_type, COUNT(*) AS grants,
  COUNT(DISTINCT grantee_user_id) AS grantees
FROM app_resource_grants
GROUP BY resource_type
```

## Funnel examples (compose manually)

1. **Register → first conversation**: users with `created_at` vs min(`app_conversations.created_at`).
2. **Upload → parsed**: `app_documents.status = 'completed'` / total uploads.
3. **KB created → chunks indexed**: compare `app_knowledge_bases` count vs `app_kb_chunks` per kb.
4. **Shallow vs deep sessions**: conversations with 1 submission vs ≥3 (join submissions to conversation id).

## Performance tips

- Filter on indexed columns: `app_conversations.updated_at`, `app_conversations.agent_name`, `document_id`, `knowledge_base_id`.
- Avoid `SELECT *` on `flue_conversation_stream_batches` and `app_kb_chunks.content`.
- Keep `GROUP BY` queries narrow; use `LIMIT` on ranked lists.
