# Templates

[Proposal Template](/meta/type-vocabulary.md) contracts — section spine, block refs, `fee_layout`, export shell. Example ↔ template mapping: [examples/index.md](/examples/index.md).

## Template catalog

| `template_id` | BU | Role | Deliverable | Default layout | Status |
|---------------|-----|------|-------------|----------------|--------|
| [sg-incorp](sg-incorp.md) | InCorp SG | Generic Word — CS, EP, tax, accounting, payroll | Word | [oneoff-recurring](/layouts/oneoff-recurring.md) | draft |
| sg-audit | InCorp SG | Special — RA internal audit | PPT | custom | planned |
| [au-advisory](au-advisory.md) | InCorp AU | Generic Word — incorporation, advisory | Word | [multi-frequency](/layouts/multi-frequency.md) | draft |
| au-audit | InCorp AU | Special — audit PPT | PPT | custom | planned |
| [ph-incorp](ph-incorp.md) | InCorp PH | CS + payroll + bookkeeping + EP + SERVICE SLAs | Word | [multi-frequency](/layouts/multi-frequency.md) | draft |
| [ph-recruitment](ph-recruitment.md) | InCorp PH | Special — recruitment & executive search (ITS) | Word | custom | draft |
| [hk-incorp](hk-incorp.md) | InCorp HK | Generic Word — company secretarial / compliance | Word | custom | draft |
| [vn-incorp](vn-incorp.md) | InCorp VN | VN fee schedule PPT | PPT | custom | draft |
| [harneys-uk](harneys-uk.md) | Harneys UK → BVI/Cayman | Unified options letter | Word | custom | draft |
| [harneys-hk](harneys-hk.md) | Harneys HK | Bilingual rates schedule | Word | custom | draft |
| sp-flexible | Any InCorp | Fallback — layout + shell only | Word / PPT | per region | planned |

## Notes

- **Harneys UK** — one template `harneys-uk` for BVI and Cayman; jurisdiction blocks use `selection` on `entity_jurisdiction`.
- **VN zh-CN** — locale reference for `vn-incorp` (`reference_role: locale`), not a second template.

Section blocks: `blocks/index.md`. Region defaults: [region-routing](/meta/region-routing.md).
