---
type: Data Adapter
adapter_id: incorp-sg-postgres
title: InCorp SG — live catalog (PostgreSQL MCP)
description: >-
  Routing hint for InCorp Singapore service/package catalog. Schema and SQL are
  not duplicated here — discover via Postgres MCP (list_tables, describe_table).
  See playbooks/catalog-search-and-matching.md.
bu: incorp
region: SG
engine: postgresql
mcp_server: postgres-sg-incorp
table_hint: service_and_fee_sg_incorp
table_pattern: service_and_fee_%_incorp
tags: [catalog, adapter, incorp, region:SG, postgresql]
status: draft
generated:
  by: human:qianping
  at: 2026-07-27T15:00:00Z
sources:
  - id: playbook
    resource: playbooks/catalog-search-and-matching.md
    title: Catalog search and matching playbook
---

# InCorp SG catalog adapter

**Routing only.** This concept does not mirror the live table schema. Columns change in the database; always **`describe_table`** via MCP before querying.

## MCP

| | |
|--|--|
| Server | `postgres-sg-incorp` |
| Typical table | `service_and_fee_sg_incorp` (confirm with `list_tables`) |
| Pattern | `service_and_fee_%` — incorp catalog tables in this database |

Credentials: proposal-agent `.env` (`SG_SP_DB_*`) — not stored in OKF.

## Conventions (verify, do not assume)

| Intent | Usual signal | Confirm via |
|--------|--------------|-------------|
| Product (SKU) | `is_package` false / 0 | `describe_table` |
| Package | `is_package` true / 1 | `describe_table` |
| Active rows only | `is_active` true / 1 | column may exist — check first |

## Workflow

Follow [catalog-search-and-matching](/playbooks/catalog-search-and-matching.md) — discovery steps are the same for all regions; only MCP server and table name differ.

## Related

* [incorp-au](/catalogs/adapters/incorp-au.md)
* [sg-incorp template](/templates/sg-incorp.md)
