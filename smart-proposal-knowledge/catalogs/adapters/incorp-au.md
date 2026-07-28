---
type: Data Adapter
adapter_id: incorp-au-postgres
title: InCorp AU — live catalog (PostgreSQL MCP)
description: >-
  Routing hint for InCorp Australia service/package catalog. Schema and SQL are
  not duplicated here — discover via Postgres MCP (list_tables, describe_table).
  See playbooks/catalog-search-and-matching.md.
bu: incorp
region: AU
engine: postgresql
mcp_server: postgres-au-incorp
table_hint: service_and_fee_au_incorp
table_pattern: service_and_fee_%_incorp
tags: [catalog, adapter, incorp, region:AU, postgresql]
status: draft
generated:
  by: human:qianping
  at: 2026-07-27T15:00:00Z
sources:
  - id: playbook
    resource: playbooks/catalog-search-and-matching.md
    title: Catalog search and matching playbook
---

# InCorp AU catalog adapter

**Routing only.** Do not treat this file as schema documentation. Use MCP discovery on every session.

## MCP

| | |
|--|--|
| Server | `postgres-au-incorp` |
| Typical table | `service_and_fee_au_incorp` (confirm with `list_tables`) |
| Pattern | `service_and_fee_%` |

Credentials: proposal-agent `.env` (`AU_SP_DB_*`).

## Conventions (verify, do not assume)

Same as [incorp-sg](/catalogs/adapters/incorp-sg.md#conventions-verify-do-not-assume): `is_package` splits product vs package; prefer `is_active` when present.

AU proposals often use [multi-frequency](/layouts/multi-frequency.md) — when presenting fees, pull whatever price / billing columns exist after `describe_table`.

## Related

* [incorp-sg](/catalogs/adapters/incorp-sg.md)
* [au-advisory template](/templates/au-advisory.md)
