---
type: Playbook
playbook_id: proposal-state-operations
title: Proposal state operations
description: >-
  Mutations for the minimal proposal state session — init, facts, catalog
  add/remove, row overrides, fee-table partition. Only when multi-turn compose
  is needed; catalog search alone does not require state. Section blocks and
  derivations are resolved at export from OKF unless runtime caches them.
tags: [playbook, proposal-state, compose, incorp]
status: draft
generated:
  by: human:qianping
  at: 2026-07-27T16:00:00Z
sources:
  - id: state-contract
    resource: meta/proposal-state.md
    title: Proposal state contract
  - id: catalog-playbook
    resource: playbooks/catalog-search-and-matching.md
    title: Catalog search and matching
---

# Proposal state operations

Applies only after the user **starts composing** a proposal. [Catalog search](/playbooks/catalog-search-and-matching.md) stays read-only and needs no state.

Contract: [proposal-state](/meta/proposal-state.md) — **minimal dynamic delta**; do not store blocks, examples, or template copies.

## When to create state

| Scenario | State? |
|----------|--------|
| Search SKU/package, explain template or example | **No** |
| Add/remove lines, set client facts, split fee tables, export | **Yes** — `init` once per proposal session |

## Pipeline (compose sessions)

```text
1. init(template_id)           → pointer + empty selections/rows/default table
2. set_facts(...)              → placeholders only
3. add_catalog_item / remove   → selections + rows (MCP for catalog row)
4. update_row / custom row     → overrides
5. partition_tables(...)       → tables[] only; rows unchanged
6. export                      → read template/blocks/layout/shell from OKF;
                               evaluate section selection; run computations
```

Steps 1–5 mutate state. Step 6 reads OKF + state; it does not grow state with block prose.

---

## Init & read

### `init`

| Input | Effect |
|-------|--------|
| `template_id` | Set; copy `catalog_filter` → `catalog_scope` |
| optional `facts` | Seed client fields |

```yaml
selections: []
solution_and_fees:
  rows: []
  tables:
    - table_id: default
      title: <fee section title from template or "Fees">
      layout_id: <template default_layout>
      row_ids: []
facts: {}
meta: { revision: 0 }
```

Do **not** copy `sections[]`, block paths, or example content.

### `get`

Summary for chat: `template_id`, selection count, row count, tables, key `facts` — not full JSON unless asked.

---

## Facts

Merge into `facts` for paths used by template placeholders (`/facts/client/company_name`, etc.). Does not affect catalog MCP.

---

## Add catalog item

Prerequisite: sku + region ([catalog playbook](/playbooks/catalog-search-and-matching.md) or user).

### SKU

1. MCP exact get (`is_package` false — confirm via `describe_table`).
2. Duplicate `source_id`? Confirm with user.
3. Append `selection`; materialize one `fee_row`.
4. Append `row_id` to `tables[default].row_ids` (or named table).

### Package

| `expand_mode` | Rows |
|---------------|------|
| `bundle_line` (default) | One row, `source_type: package` |
| `expand_components` | One row per component in discovered json field |

One `selection` per add; shared `selection_id` for expanded rows.

### Materialize (catalog row → fee_row)

Discovery-first — see [layouts/](/layouts/index.md) for target shape. Not 1:1 DB columns. Prefer catalog display text over invented amounts. Do not set computed `fees.total` here ([fee-table-total-column](/computations/fee-table-total-column.md) at export).

---

## Remove catalog item

Confirm → remove `selection`(s), linked `rows`, strip `row_id` from all `tables[].row_ids`.

---

## Row overrides & custom lines

- **Override:** user edits title, scope, or fees on a proposal line → `rows[].overrides` (or merged fields); never UPDATE catalog.
- **Custom:** `source_type: custom`, `is_custom: true`, no `selection_id`.

---

## Partition tables

Only `tables[]` changes; `rows[]` unchanged.

Execute user or AI-confirmed instructions (by column value, explicit assign, one-row-per-table, merge, etc.). Each `row_id` in at most one table (default). Unassigned rows stay in `default` or prompt user.

---

## Derivations & section blocks (export-time)

**Default: do not persist in state.**

| Concern | When |
|---------|------|
| `selected_packages_summary`, first invoice, row totals | Compute at export from `rows` + [computations](/computations/index.md) |
| Optional [Section Block](/meta/type-vocabulary.md) inclusion | Evaluate `selection` against current `rows` + `facts` + template — load block body from bundle |

Runtime may cache `derivations` after add/remove for faster chat preview; cache is optional and safe to discard before export.

---

## Export prep

1. Load `templates/{template_id}`, blocks, layouts, `export.word.shell` from OKF.
2. Merge `facts` + computed derivations into placeholders.
3. Render `tables[]` + `rows[]` into shell fee zones.
4. Include static and conditional sections from bundle (not from state).

Word binary generation — Phase 3.

---

## Planned tools (consumer implementation)

| Tool | Mutates state? |
|------|----------------|
| `proposal_init` | yes |
| `proposal_get_state` | no |
| `proposal_set_facts` | yes |
| `proposal_add_catalog_item` | yes |
| `proposal_remove_catalog_item` | yes |
| `proposal_update_row` | yes |
| `proposal_partition_tables` | yes (`tables` only) |
| `proposal_propose_partition` | no (suggestion only) |

---

## Related

* [proposal-state](/meta/proposal-state.md)
* [catalog-search-and-matching](/playbooks/catalog-search-and-matching.md)
* [layouts](/layouts/index.md)
