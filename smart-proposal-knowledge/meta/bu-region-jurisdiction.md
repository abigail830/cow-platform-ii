---
type: Reference
title: BU, region, and jurisdiction
description: >-
  Market taxonomy — BU, issuing region, and entity/service jurisdiction.
  Distinguishes multi-entity outbound deals from single-document proposal scope.
tags: [meta, vocabulary, bu, region, jurisdiction]
status: stable
generated:
  by: human:qianping
  at: 2026-07-26T13:10:00Z
---

# BU, region, jurisdiction

Avoid the phrase **「client jurisdiction」** — it conflates three different things (see below).

## Core definitions

| Concept | Question it answers | Example |
|---------|---------------------|---------|
| **BU** | Which brand / business unit? | `incorp`, `harneys` |
| **Region** | Which **our** office **issues** this proposal? | InCorp SG, Harneys UK, InCorp VN |
| **Entity jurisdiction** | Where is the **legal entity being formed or served** domiciled? | BVI holdco, SG opco, VN subsidiary |
| **Service jurisdiction** *(optional)* | Where are the **scoped services** regulated/performed? | VN payroll for VN factory (often = entity jurisdiction) |

**Region** is always about **us**. **Entity jurisdiction** is about **the subject company** in that proposal section.

### What is NOT «jurisdiction» in this bundle

| Term | Use instead | Notes |
|------|-------------|-------|
| Client's home country (中国客户) | `client_domicile: CN` *(optional, deal metadata)* | Ultimate parent nationality; rarely drives template/blocks |
| Where the PDF is sent from | `region` | Already covered |
| Multi-country **engagement** | Multiple proposals or `entity_jurisdictions: [...]` | One deal ≠ one jurisdiction |

## Multi-jurisdiction example (中国客户出海)

Scenario: PRC client → BVI holdco (tax) + SG/HK opco + VN factory.

| Layer | Values | Proposal handling |
|-------|--------|-------------------|
| Client domicile | CN | Deal context only; do not copy PII into concepts |
| Entity 1 — holdco | `entity_jurisdiction: BVI` | Harneys UK letter — `template_id: harneys-uk` |
| Entity 2 — trading | `entity_jurisdiction: SG` or `HK` | InCorp `region:SG` or `region:HK` proposal |
| Entity 3 — factory | `entity_jurisdiction: VN` | InCorp `region:VN` — CS / tax / payroll / HR |
| **Engagement** | `{BVI, SG, VN}` | **3 documents** or 1 master doc with 3 scoped fee modules |

```text
Engagement (deal)
├── Proposal A  region:UK   entity_jurisdictions:[BVI]     Harneys holdco
├── Proposal B  region:SG   entity_jurisdictions:[SG]      SG opco
└── Proposal C  region:VN   entity_jurisdictions:[VN]      VN subsidiary + payroll
```

Do **not** tag a single Reference Proposal as `jurisdiction:BVI` when the body also covers VN factory services — split artifacts or list all `entity_jurisdictions`.

## Harneys: region × entity jurisdiction

Harneys **regions** (HK, UK) issue proposals for **entity jurisdictions** (BVI, Cayman) where the vehicle is formed.

| Sample | Issuing region | Entity jurisdiction |
|--------|----------------|---------------------|
| `harneys-uk-BVI_*` | UK | BVI |
| `harneys-uk-CAYMAN_*` | UK | Cayman |
| `harneys-hk-Incorporation` | HK | HK |

## InCorp regions

Operating markets (issuing `region`): SG, AU, PH, VN, MY, ID, HK, CN, IN, …

For **local incorporation** proposals, `region` and `entity_jurisdiction` usually match (SG office → SG company). For **cross-border** work (SG office helping a BVI structure), tag both explicitly.

## Rikvin (InCorp SG immigration)

Rikvin is a **brand track** under InCorp SG — not a separate BU or issuing region. Tag `rikvin` when routing immigration-only proposals or EP modules with the subsidiary disclaimer.

| Concept | Value |
|---------|-------|
| Tags | `incorp`, `rikvin`, `region:SG`, `jurisdiction:SG` |
| Services | Employment Pass, DP, PEP/ONE Pass, education verification |
| Routing | [Rikvin — SG immigration](/meta/region-routing.md#rikvin--sg-immigration) |

## Frontmatter conventions

**Single-entity proposal** (most reference samples):

```yaml
tags: [incorp, region:VN, jurisdiction:VN]
# jurisdiction: = primary entity_jurisdiction (shorthand tag)
```

**Multi-entity proposal** (future):

```yaml
tags: [incorp, region:SG]
entity_jurisdictions: [BVI, SG, VN]
primary_entity_jurisdiction: BVI   # drives Harneys block pack when mixed
```

Optional deal-level only (not on Reference Proposal bodies):

```yaml
client_domicile: CN
```

## Path conventions

| Content | Path |
|---------|------|
| Region-owned prose (AU Payment Options) | `blocks/{bu}/regions/{region}/` |
| Entity-law prose (BVI Approved Manager) | `blocks/{bu}/jurisdictions/{entity_jurisdiction}/` |
| BU-wide shared | `blocks/{bu}/shared/` |

`catalogs/products/{region}.md` keys off **issuing region** (which DB to query).  
Harneys MDM / required-docs keys off **entity jurisdiction** (BVI vs Cayman).

## Routing

- [Region routing](/meta/region-routing.md) — layout & catalog by **issuing region**
- Entity jurisdiction — Harneys block packs, `selection` on Section Blocks, MDM product scope
