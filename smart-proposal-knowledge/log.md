# Update Log

## 2026-07-26

* **Creation**: Scaffolded smart-proposal-knowledge OKF bundle (Phase 1) — root index, meta concepts, directory structure for layouts, catalogs, templates, blocks, brand, examples, computations, playbooks, and references staging.
* **Brand shell ingest (Phase 3 pilot)**: Layer 1 extraction via `officecli` from `references/inbox/` → `references/extractions/brand-shell-20260726/`; binaries promoted to `references/templates/`; draft `Output Shell` concepts at `brand/ascentium-word-shell.md` and `brand/ascentium-pptx-shell.md`.
* **SG reference proposals (Phase 3)**: Ingested 3 InCorp SG samples — `incorp-sg-CS_EP_Accounting_Payroll_TAX.docx`, `incorp-sg-rikvin-Employment_Pass_Application.docx`, `incorp-sg-InternalAudit.pptx` → `references/examples/` + `references/extractions/incorp-sg-*/` + draft `Reference Proposal` concepts under `examples/`.
* **Section Blocks (sg-incorp) — corrected**: Re-extracted from `references/extractions/incorp-sg-cs-ep-accounting-payroll-tax/text.txt` only; removed composer-sourced prose; added `credentials-visual` for image-only spine.
* **Reference proposals batch (Phase 3/4)**: Ingested remaining 10 inbox samples → `references/examples/` + extractions + 10 draft `Reference Proposal` concepts (13 total with SG).
* **Taxonomy**: Added [bu-region-jurisdiction.md](meta/bu-region-jurisdiction.md) — distinguish BU, issuing **region**, and client **jurisdiction**; fixed `region-routing.md` (BVI/Cayman are jurisdictions, not regions); reorganized `blocks/` to `regions/` vs `jurisdictions/`; updated example tags to `incorp|harneys`, `region:*`, `jurisdiction:*`.
