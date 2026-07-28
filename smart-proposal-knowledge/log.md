# Update Log

## 2026-07-27

* **Proposal state**: [proposal-state](meta/proposal-state.md) revised — optional minimal session (catalog/facts/rows/tables only); [proposal-state-operations](playbooks/proposal-state-operations.md) aligned; blocks/examples/template read at export.
* **Catalog adapters (Phase 2a)**: Discovery-first routing for InCorp [incorp-sg](catalogs/adapters/incorp-sg.md) / [incorp-au](catalogs/adapters/incorp-au.md); [catalog-search-and-matching](playbooks/catalog-search-and-matching.md) — `list_tables` / `describe_table` / flexible SELECT (no fixed schema in OKF).
* **Region routing**: InCorp SG/AU rows point to live adapters; data source priority updated (PostgreSQL, not MySQL).

## 2026-07-26

* **sg-incorp cleanup**: Removed superseded `CS_EP_Accounting_Payroll_TAX` (inbox, examples binary, extraction, example concept). Anchor is `incorp-sg-cs-tax-payroll-accounting-ff`; Rikvin disclaimer sources `incorp-sg-employment-pass` extraction.
* **sg-incorp anchor swap**: Ingested `incorp-sg-CS_Tax_Payroll_Accounting_ff.docx` → `references/extractions/incorp-sg-cs-tax-payroll-accounting-ff/` + `examples/incorp-sg-cs-tax-payroll-accounting-ff.md`; template `anchor_example` updated (optional **Estimated first invoice** tbl[6]).
* **Creation**: Scaffolded smart-proposal-knowledge OKF bundle (Phase 1) — root index, meta concepts, directory structure for layouts, catalogs, templates, blocks, brand, examples, computations, playbooks, and references staging.
* **Brand shell ingest (Phase 3 pilot)**: Layer 1 extraction via `officecli` from `references/inbox/` → `references/extractions/brand-shell-20260726/`; binaries promoted to `references/templates/`; draft `Output Shell` concepts at `brand/ascentium-word-shell.md` and `brand/ascentium-pptx-shell.md`.
* **SG reference proposals (Phase 3)**: Ingested InCorp SG samples — `incorp-sg-rikvin-Employment_Pass_Application.docx`, `incorp-sg-InternalAudit.pptx`, `incorp-sg-CS_Tax_Payroll_Accounting_ff.docx` → `references/examples/` + `references/extractions/incorp-sg-*/` + draft `Reference Proposal` concepts under `examples/`.
* **Templates + blocks batch**: `au-advisory`, `ph-incorp`, `vn-incorp`, `harneys-uk` (BVI/Cayman unified), `harneys-hk` — all blocks from `references/extractions/*/text.txt`.
* **Reference proposals batch (Phase 3/4)**: Ingested remaining 10 inbox samples → `references/examples/` + extractions + 10 draft `Reference Proposal` concepts (13 total with SG).
* **Link dedup (OKF §8)**: Single authoritative example↔template map in `examples/index.md` + `template_id` frontmatter on Reference Proposals; removed bidirectional catalog links from templates, region-routing, layouts, and blocks index.
* **PH recruitment (Special)**: `ph-recruitment` template + 8 blocks from `references/extractions/incorp-ph-recruitment/text.txt`; reuses PH `about-incorp` / `credentials-visual`.
* **HK anchor**: `incorp-hk-cs-zh-cn` repositioned as InCorp HK generic anchor (`hk-incorp`); listed-co/IPO context is case-specific only.
* **HK blocks**: 9 Section Blocks under `blocks/incorp/regions/hk/` from `incorp-hk-cs-zh-cn` extraction; `hk-incorp` template wired.
* **Taxonomy**: Added [bu-region-jurisdiction.md](meta/bu-region-jurisdiction.md) — distinguish BU, issuing **region**, and client **jurisdiction**; fixed `region-routing.md` (BVI/Cayman are jurisdictions, not regions); reorganized `blocks/` to `regions/` vs `jurisdictions/`; updated example tags to `incorp|harneys`, `region:*`, `jurisdiction:*`.
