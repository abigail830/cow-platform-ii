# Data adapters

Live catalog **routing hints** for Postgres MCP. Schema is **not** copied into OKF — agents use `list_tables` and `describe_table` per [catalog-search-and-matching](/playbooks/catalog-search-and-matching.md).

| Adapter | Region | MCP server | Table hint |
|---------|--------|------------|------------|
| [incorp-sg](incorp-sg.md) | SG | `postgres-sg-incorp` | `service_and_fee_sg_incorp` |
| [incorp-au](incorp-au.md) | AU | `postgres-au-incorp` | `service_and_fee_au_incorp` |

Harneys and other regions — Phase 2+.
