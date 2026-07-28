---
type: Proposal State Contract
contract_id: proposal-state
title: Proposal state — minimal compose session contract
description: >-
  Optional runtime session for multi-turn proposal compose. Stores only dynamic
  deltas not already in OKF — catalog picks, fee rows, facts, table partition,
  row overrides. Template, blocks, examples, layouts, and shell are read from
  the bundle at export time; instances are not OKF concepts.
tags: [meta, proposal-state, compose, runtime]
status: draft
generated:
  by: human:qianping
  at: 2026-07-27T16:00:00Z
sources:
  - id: operations-playbook
    resource: playbooks/proposal-state-operations.md
    title: Proposal state operations playbook
  - id: layout-registry
    resource: layouts/index.md
    title: Quotation layout registry
---

# Proposal state

**Optional.** Catalog [search/matching](/playbooks/catalog-search-and-matching.md) needs no proposal state. Create state only when the user composes a proposal across turns (add/remove services, facts, fee-table layout, export).

This contract defines the **minimal session shape** — not a copy of the proposal document. Static knowledge stays in OKF; state holds **what differs per client and per editing session**.

## What belongs in state

| Field | Purpose |
|-------|---------|
| `template_id` | Pointer to [Proposal Template](/templates/index.md) — do not copy `sections[]` |
| `catalog_scope` | `bu` + `region` aligned with template `catalog_filter` |
| `facts` | Placeholder values (`client`, dates, contacts) for block tokens |
| `selections[]` | Which catalog SKUs/packages were chosen |
| `solution_and_fees.rows[]` | Materialized fee lines (layout-shaped); includes overrides |
| `solution_and_fees.tables[]` | How rows are grouped into Word fee tables |
| `meta` | `revision`, `updated_at` |

## What does not belong in state

| Source | At compose/export time |
|--------|------------------------|
| [Section Block](/blocks/index.md) prose | Load from bundle via template |
| [Reference Proposal](/examples/index.md) | Agent **reference only** — never copy into state |
| Template `sections[]`, `fee_layout`, export config | Read from template by `template_id` |
| [Quotation Layout](/layouts/index.md) column defs | Read from layout by `layout_id` |
| [Output Shell](/brand/index.md) | Read from template `export` |
| Full catalog rows | Prefer `selections[].source_id` + MCP re-fetch; rows hold materialized fee slice only |
| Conditional section inclusion | **Evaluate at export** from template + block `selection` + current `rows` — no default `sections{}` bag |
| Computation outputs | **May omit** from state; recompute at export unless runtime caches for UX |

## Compose flow (when state exists)

```text
Catalog (MCP) ──► selections[] ──► materialize ──► solution_and_fees.rows[]
User input ──────► facts{}
User / AI ───────► tables[] partition, row overrides
                          │
        Export ◄──────────┘
          ├─ read template, blocks, layout, shell from OKF
          ├─ evaluate optional sections (not stored)
          ├─ run computations if needed
          └─ render Word / PPT
```

## Top-level shape

```yaml
proposal_id: string              # optional until persisted
template_id: string              # required once state is created
catalog_scope:
  bu: string
  region: string

facts: {}
selections: []
solution_and_fees:
  rows: []
  tables:
    - table_id: default
      title: string
      layout_id: string          # from template default_layout initially
      row_ids: []

meta:
  revision: number
  updated_at: string
```

Optional runtime cache (not required by contract):

```yaml
derivations: {}                  # e.g. selected_packages_summary — may refresh at export
```

## `selections[]`

```yaml
- selection_id: sel-001
  region: SG
  source_type: sku              # sku | package
  source_id: string
  added_at: string
  expand_mode: null             # package: bundle_line | expand_components
```

## `solution_and_fees.rows[]`

Must match [Quotation Layout](/layouts/index.md) for `layout_id`.

```yaml
- row_id: row-001
  selection_id: sel-001         # omit for custom lines
  layout_id: oneoff-recurring
  source_type: sku              # sku | package | package_component | custom
  source_id: string
  is_custom: false
  title: string
  scope_bullets: []
  fees: {}
  overrides: {}                 # proposal-only edits; never write to catalog
```

Materialize: [proposal-state-operations](/playbooks/proposal-state-operations.md).

## `solution_and_fees.tables[]`

Rows are authoritative; tables are **views** for Word (split/merge/reorder without duplicating row data).

## `facts`

Paths align with template `placeholders[].draft_path` under `/facts/…`. User and CRM input only.

## Template binding (pointers only)

| State | From template (at read time) |
|-------|------------------------------|
| `template_id` | identity |
| `catalog_scope` | `catalog_filter` |
| default `tables[].layout_id` | `default_layout` or fee section `layout` |
| shell, section spine | `export`, `sections[]` — **not copied into state** |

## Related

* [proposal-state-operations](/playbooks/proposal-state-operations.md)
* [catalog-search-and-matching](/playbooks/catalog-search-and-matching.md)
* [type vocabulary](/meta/type-vocabulary.md)
