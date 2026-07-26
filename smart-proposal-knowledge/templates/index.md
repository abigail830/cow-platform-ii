# Templates

[Proposal Template](/meta/type-vocabulary.md) contracts — section spine, block refs, `fee_layout`, export shell.

**Not** 1:1 with [Reference Proposals](/examples/index.md). Each template has an **anchor example** (generic fallback spine) and optional **special** variants (audit decks, rates schedules, etc.).

## Template catalog

| `template_id` | BU | Role | Deliverable | Default layout | Anchor example | Status |
|---------------|-----|------|-------------|----------------|----------------|--------|
| [sg-incorp](sg-incorp.md) | InCorp SG | **Generic** — CS, EP, tax, accounting, payroll, multi-service Word | Word | [oneoff-recurring](/layouts/oneoff-recurring.md) | [incorp-sg-cs-ep-accounting-payroll-tax](/examples/incorp-sg-cs-ep-accounting-payroll-tax.md) | draft |
| sg-audit | InCorp SG | **Special** — RA / internal audit | PPT | custom matrix | [incorp-sg-internal-audit](/examples/incorp-sg-internal-audit.md) | Phase 2 |
| [au-advisory](au-advisory.md) | InCorp AU | **Generic** — incorporation, advisory, multi-service Word | Word | [multi-frequency](/layouts/multi-frequency.md) | [incorp-au-incorporation](/examples/incorp-au-incorporation.md) | Phase 2 |
| au-audit | InCorp AU | **Special** — audit & assurance | PPT | custom matrix | [incorp-au-audit](/examples/incorp-au-audit.md) | Phase 2 |
| [harneys-bvi](harneys-bvi.md) | Harneys UK → BVI | **Generic** — UK-issued BVI corporate services | Word | custom | [harneys-uk-bvi-all-options](/examples/harneys-uk-bvi-all-options.md) | Phase 2 |
| harneys-cayman | Harneys UK → Cayman | **Generic** — same spine family as BVI; jurisdiction-specific blocks | Word | custom | [harneys-uk-cayman-all-options](/examples/harneys-uk-cayman-all-options.md) | Phase 2 |
| harneys-hk | Harneys HK → HK | **Own template** — bilingual rates / administration schedule | Word | custom matrix | [harneys-hk-incorporation](/examples/harneys-hk-incorporation.md) | Phase 2 |
| sp-flexible | Any InCorp | Fallback — no fixed section spine; layout + shell only | Word / PPT | per region | — | Phase 2 |

### Composition notes

**InCorp SG (`sg-incorp`)** — one Word template covers CS, EP, tax, accounting, payroll, and combined packages. Fee modules stack; layout stays `oneoff-recurring`. Immigration adds Rikvin disclaimer blocks ([Rikvin routing](/meta/region-routing.md#rikvin--sg-immigration)) — not a separate template. [Rikvin EP-only](/examples/incorp-sg-rikvin-employment-pass.md) is a **subset** of the same spine.

**InCorp SG audit (`sg-audit`)** — separate PPT deck; year-based fee matrix. Do not fold into `sg-incorp`.

**InCorp AU (`au-advisory`)** — generic Word for incorporation and advisory; Payment Option A/B is a template section (see legacy `au-advisory` yaml). [incorp-au-audit](/examples/incorp-au-audit.md) is a **separate** PPT template (`au-audit`).

**Harneys UK (`harneys-bvi` / `harneys-cayman`)** — BVI and Cayman share the same options-letter spine (incorporation, AM, compliance, optional items, KYC). Fork by `entity_jurisdiction` and jurisdiction-specific blocks — not two unrelated templates.

**Harneys HK (`harneys-hk`)** — distinct bilingual rates schedule; not the UK options-letter pattern.

### Examples without a dedicated template yet

| Example | Notes |
|---------|-------|
| [incorp-ph-cs](/examples/incorp-ph-cs.md), [incorp-ph-recruitment](/examples/incorp-ph-recruitment.md) | Phase 2+ — likely `sp-flexible` or region-specific fork |
| [incorp-hk-cs-zh-cn](/examples/incorp-hk-cs-zh-cn.md), [incorp-vn-*](/examples/incorp-vn-cs-tax-payroll-tax-hr.md) | Phase 2+ — PPT / zh-CN variants |

## Migration sources

| `template_id` | Legacy `template.yaml` | Anchor example |
|---------------|------------------------|----------------|
| sg-incorp | `proposal-composer/.../templates/sg-incorp/` | incorp-sg-cs-ep-accounting-payroll-tax |
| au-advisory | `.../templates/au-advisory/` | incorp-au-incorporation |
| harneys-bvi | `.../templates/harneys-bvi/` | harneys-uk-bvi-all-options |
| harneys-cayman | fork from harneys-bvi | harneys-uk-cayman-all-options |
| sg-audit, au-audit, harneys-hk | derive from anchor examples | see catalog above |

Export shell for new Ascentium deliverables: [ascentium-word-shell](/brand/ascentium-word-shell.md) / [ascentium-pptx-shell](/brand/ascentium-pptx-shell.md). Anchor examples use **legacy** shells for structure study only.

See [region routing](/meta/region-routing.md).
