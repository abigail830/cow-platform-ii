---
name: product-analytics
description: >-
  Query the platform PostgreSQL database for product usage, adoption, and behavioral
  analytics. Use when analyzing DAU/WAU, agent playground usage, knowledge-base adoption,
  pipeline health, studio builder activity, or funnel metrics via read-only SQL.
---

# Product Analytics (SQL + MCP)

Answer product questions with **aggregated evidence from the platform database** — not guesses.

## Prerequisites

The user must own a **read-only PostgreSQL datasource** named **`platform-analytics`** (Asset Market → Datasources) pointing at the platform app database. MCP tool names follow the datasource name:

| Tool | Flue name |
|------|-----------|
| List tables | `mcp__platform-analytics__list_tables` |
| Describe columns | `mcp__platform-analytics__describe_table` |
| Run SQL | `mcp__platform-analytics__execute_sql` |

If tools are missing, stop and tell the user to create the datasource (name must be `platform-analytics`, type postgres, **readonly**).

Do **not** use bash, `which`, or shell commands to invoke MCP tools — they are only available as Flue tool calls when the datasource is wired at runtime.

## Workflow

1. **Clarify** — question, time range (default last 30 days unless stated), and whether they want a snapshot or comparison (vs prior period).
2. **Schema** — use `reference.md` in this skill for table map and join keys; call `describe_table` only when you need column confirmation.
3. **Query** — prefer `execute_sql` with **aggregations** (`COUNT`, `GROUP BY`, date buckets). One statement per call; no `;` or writes.
4. **Iterate** — if a query is empty or surprising, broaden/narrow time range or check status filters before concluding.
5. **Report** — PM-friendly narrative + numbers + caveats (sample size, row limits, approx counts).

## Privacy and safety

- Default to **aggregates** (counts, rates, distributions). Do not paste raw emails, passwords, or full conversation text unless the user explicitly requests individual-level export and has admin context.
- Never expose `password_hash`, `key_hash`, `password_encrypted`, or decrypted credentials.
- Label small-N results (e.g. fewer than 5 users) as low confidence.
- `execute_sql` is row-limited (often 100 rows); note truncation in the answer.

## Analysis lenses (pick what fits the question)

| Lens | Primary tables |
|------|----------------|
| User & adoption | `app_users`, `app_user_roles`, `app_user_api_keys` |
| Agent playground | `app_conversations`, `flue_agent_submissions`, `flue_conversation_streams`, `app_session_files`, `app_e2b_sessions` |
| Knowledge & content | `app_knowledge_bases`, `app_documents`, `app_document_channels`, `app_kb_*`, `app_pipeline_jobs` |
| Automation / builtin agents | `app_sync_agent_runs`, `app_sync_agent_messages` |
| Builder / studio | `app_studio_agents`, `app_user_mcp_servers`, `app_user_datasources` |
| Permissions & sharing | `app_resource_grants`, `app_agent_permissions` |

## SQL conventions

- Timestamps on `app_*` tables are `timestamptz` — use `created_at`, `updated_at`, `imported_at` where available.
- **Flue submissions**: `accepted_at` and `settled_at` are **epoch milliseconds as text/bigint** — convert with `(accepted_at::bigint / 1000)::timestamptz` (PostgreSQL).
- **Session identity**: `flue_agent_submissions.session_key` embeds `userId--conversationId`; `app_conversations` links `user_id`, `agent_name`, `id`.
- **Turn latency (ms)**: `settled_at::bigint - accepted_at::bigint` on `flue_agent_submissions` where `status = 'settled'`.
- **User turns in a session**: count submissions per session_key, or parse stream batches (expensive — prefer submissions for volume/latency).
- Use `date_trunc('day', …)` for trends; compare periods with separate queries or conditional aggregation.

## Output format

```markdown
## Summary
(1–3 sentences — the answer)

## Metrics
| Metric | Value | Notes |
|--------|-------|-------|

## Observations
- …

## Caveats
- time range, row limits, definitions used

## Suggested follow-ups
(optional, 1–2 concrete next analyses)
```

## References

- Full schema map, join diagram, and starter SQL: `reference.md` in this skill directory.
