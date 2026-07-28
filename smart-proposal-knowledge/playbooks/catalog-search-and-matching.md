---
type: Playbook
playbook_id: catalog-search-and-matching
title: Catalog search and matching (InCorp SG / AU)
description: >-
  Discovery-first workflow for live service/package catalogs via official
  PostgreSQL MCP — list_tables, describe_table, then flexible SELECT. No fixed
  schema or SQL templates in OKF; matching is recommend-only (no proposal writes).
tags: [playbook, catalog, search, matching, incorp, region:SG, region:AU]
status: draft
scope:
  bu: [incorp]
  regions: [SG, AU]
generated:
  by: human:qianping
  at: 2026-07-27T15:00:00Z
sources:
  - id: adapter-sg
    resource: catalogs/adapters/incorp-sg.md
    title: InCorp SG data adapter
  - id: adapter-au
    resource: catalogs/adapters/incorp-au.md
    title: InCorp AU data adapter
---

# Catalog search and matching

OKF documents **how to work** with the catalog, not what the catalog contains. Row data and column lists live in PostgreSQL; use **native Postgres MCP** tools (`list_tables`, `describe_table`, `query`) — no wrapped catalog tools required.

**Compose (optional):** create [proposal state](/meta/proposal-state.md) only when adding to a proposal — [proposal-state-operations](/playbooks/proposal-state-operations.md).

**Out of scope here:** state mutations (add/remove/partition) — [proposal-state-operations](/playbooks/proposal-state-operations.md). Word export — Phase 3.

## Region → MCP

| Region | MCP server | Adapter (routing hint) |
|--------|------------|------------------------|
| SG | `postgres-sg-incorp` | [incorp-sg](/catalogs/adapters/incorp-sg.md) |
| AU | `postgres-au-incorp` | [incorp-au](/catalogs/adapters/incorp-au.md) |

If region is ambiguous, ask before connecting.

## Core workflow (every catalog task)

```
1. Pick region MCP from the table above.
2. list_tables → find catalog table(s). Common pattern: service_and_fee_<region>_incorp
   (other BUs/regions may use service_and_fee_* — do not hardcode if list_tables shows otherwise).
3. describe_table on the chosen table BEFORE writing SQL.
4. Products = rows that are NOT packages — usually is_package = false/0 (confirm type via describe).
   Packages = is_package = true/1.
5. Build SELECT from actual columns; keyword / sku / name search; only SELECT; always LIMIT.
```

Re-run **step 3** when results look wrong or a filter fails — the schema may have changed since the last query.

## Query guardrails

| Rule | Notes |
|------|-------|
| **SELECT only** | No INSERT / UPDATE / DELETE |
| **LIMIT** | Default 30; max 100 unless user needs more |
| **Active rows** | If `is_active` exists, filter active rows |
| **ILIKE** | PostgreSQL case-insensitive text match |
| **Sample first** | `SELECT * … LIMIT 3` when JSON columns or unfamiliar fields |

Do **not** rely on column names from old chat context or from OKF prose — use `describe_table` output for the current session.

## Common column roles (hints only)

These names appear often in incorp SG/AU catalogs. **They may be missing or renamed** — map from `describe_table`, never from this table alone.

| Role | Typical column names | Use |
|------|---------------------|-----|
| Id | `sku`, `id` | Exact lookup |
| Display name | `service_name`, `service_name_on_proposal` | Search, show user |
| Package flag | `is_package` | Split product vs package |
| Taxonomy | `service_domain`, `service_category` | Browse / filter |
| Scope | `scope_of_work` | Keyword search, matching |
| Price | `hubspot_price`, `one_off_fee`, `annual_fee`, `standard_pricing` | Present to user |
| Billing | `hubspot_billing_frequency` | Filter, AU multi-frequency context |
| Package detail | `service_items`, `selection_rules`, `business_case` | JSON — fetch for packages when matching |
| Currency | `currency_code` | Display |
| Proposal filter | `proposal_types` | JSON — inspect sample row before filtering |

If a expected role has no column, search other text/json fields or ask the user.

## Search (user knows what to look for)

### Browse taxonomy

After `describe_table`, if domain/category columns exist:

- `SELECT DISTINCT <domain_col>, <category_col> FROM … WHERE <active?> ORDER BY 1, 2`

Then filter drill-down with equality on those columns.

### Keyword search

1. Pick text columns from `describe_table` (at minimum name + sku; add scope/description columns if present).
2. `WHERE (col1 ILIKE '%term%' OR col2 ILIKE '%term%' OR …)` — one or more keywords.
3. If user asked for **packages only** or **services only**, add `is_package` filter after confirming the column.

### Exact SKU

When user gives a sku id: `WHERE sku = '…'` (or the actual id column name) — prefer this over keyword search.

### Inspect one package

For `is_package = true` rows, `SELECT *` or include json columns (`service_items`, `business_case`, `selection_rules`) for scope and matching — only if those columns exist.

## Matching (user describes a scenario)

### Principle

**Products and packages are peers.** After discovery, gather candidates from **both** sides (not package-only or product-only unless user was explicit).

```
User scenario
    ├─► SELECT … is_package = false (+ keywords)  ─┐
    │                                               ├─► rank → top 3–5
    └─► SELECT … is_package = true  (+ keywords)  ─┘
```

### Checklist

- [ ] Steps 1–3 (region, list_tables, describe_table) done
- [ ] Keyword search on products **and** packages (unless user restricted)
- [ ] Exact sku lookup if user named one
- [ ] Package rows: read json/detail columns when present
- [ ] Did not skip one entity type because the other already had hits

### Ranking (qualitative)

| Signal | Weight |
|--------|--------|
| User-named sku | Exact — top |
| Name / scope matches intent keywords | High |
| Domain / category fits scenario | High |
| Package json covers multiple stated needs | High (packages) |
| Single sku covers one stated need | High (products) |
| `business_case` / `selection_rules` text aligns | Medium–high |

Show business reasons, not numeric scores.

### Recommend only (no state unless user composes)

| Situation | Action |
|-----------|--------|
| One clear exact hit | Present as primary; if user asks to add → init state + [proposal-state-operations](/playbooks/proposal-state-operations.md) |
| Several strong hits | Top 3–5 numbered list; user picks before any state write |
| Package + overlapping skus | Package first; skus as à la carte |
| No hits | Broader keywords, browse taxonomy, or clarifying questions |
| Custom / not in catalog | No catalog match; custom row at compose time (`is_custom`) |

Do **not** auto-add without user confirmation.

### User-facing format

No raw JSON dumps. Example:

> **Top matches** for *Singapore incorporation + company secretarial*:
> 1. **…** (package) — …
> 2. **…** (SKU) — …
>
> Reply with a number, a SKU, or refine the ask.

Use column values you actually selected — names, prices, domain/category when helpful.

## Agent read order

1. This playbook
2. Regional adapter (MCP id + table **hint** only)
3. Postgres MCP: `list_tables` → `describe_table` → `query`
4. Compose context (not catalog data): [templates](/templates/index.md), [layouts](/layouts/index.md)

## MCP credentials (consumer repo)

Not in OKF. Proposal-agent `.env`: `SG_SP_DB_*`, `AU_SP_DB_*`. Two `@modelcontextprotocol/server-postgres` instances — one per regional database.

## Related

* [catalogs/adapters/](/catalogs/adapters/)
* [region-routing](/meta/region-routing.md)
