# Blocks

All reusable proposal prose is **`Section Block`** — one type, optional `selection` for conditional chapters.

See [BU / region / jurisdiction](/meta/bu-region-jurisdiction.md) before choosing a path.

## Reference Proposal ≠ Section Block

| Layer | What ingest produces | Contains prose? |
|-------|---------------------|-----------------|
| **Reference Proposal** (`examples/`) | Spine, fee shape, module list, **block candidates** | No — structure only |
| **Section Block** (`blocks/`) | Placeholderized boilerplate ready for templates | Yes — client-facing copy |

**Do not auto-extract blocks during reference ingest** — promote after dedup, placeholderize, and human `verified`. See promotion workflow in prior revision.

## Directory layout

Three levels under each **BU**:

```
blocks/
  incorp/
    shared/                    # cross-region InCorp prose
    regions/
      sg/  au/  ph/  hk/  vn/  my/  id/  ...
  harneys/
    shared/                    # e.g. About Ascentium (fiduciary letters)
    regions/
      hk/  uk/                 # issuing office prose
    jurisdictions/
      bvi/  cayman/            # client domicile prose (UK region → BVI co)
```

| Path segment | Means | Example block |
|--------------|-------|---------------|
| `regions/{code}/` | Subsidiary that **sends** the proposal | `incorp/regions/au/payment-option-a.md` |
| `jurisdictions/{code}/` | Where **client entity** is formed (mainly Harneys) | `harneys/jurisdictions/bvi/approved-manager-benefits.md` |
| `shared/` | Same copy across regions/jurisdictions within BU | `incorp/shared/about-incorp.md` |

**Do not** put BVI/Cayman under `harneys/regions/` — those are **jurisdictions**, not operating regions.

Audit / risk-assurance modules belong under the **issuing region**, e.g. `incorp/regions/sg/internal-audit-methodology.md`, not a top-level `audit/` tree.

## Promotion sources

| Example pattern | Block target |
|-----------------|--------------|
| `incorp-sg-*` | `incorp/regions/sg/` or `incorp/shared/` |
| `incorp-au-*` | `incorp/regions/au/` |
| `harneys-uk-BVI_*` | `harneys/jurisdictions/bvi/` (+ `harneys/regions/uk/` for letter chrome) |
| `harneys-hk-*` | `harneys/regions/hk/` |

**Templates** (`templates/`) reference block paths; they declare both `region` and `jurisdiction` where applicable.

## Status

### `incorp/regions/sg/` — [sg-incorp](/templates/sg-incorp.md)

All prose extracted from [incorp-sg-cs-ep extraction](/references/extractions/incorp-sg-cs-ep-accounting-payroll-tax/text.txt) — **not** from legacy composer.

| Block | `render` | Source in sample |
|-------|----------|------------------|
| [about-incorp](incorp/regions/sg/about-incorp.md) | text | Intro paragraphs only (lines 33–35) |
| [credentials-visual](incorp/regions/sg/credentials-visual.md) | visual_pending | Snapshot / Locations / services map / accreditations — image-only |
| [executive-summary](incorp/regions/sg/executive-summary.md) | text | Fee proposal letter (lines 69–81, PII → placeholders) |
| [scope-of-service](incorp/regions/sg/scope-of-service.md) | text | Scope paragraph (line 85) |
| [solution-pricing-intro](incorp/regions/sg/solution-pricing-intro.md) | text | Fees intro (line 90) |
| [terms-incorp](incorp/regions/sg/terms-incorp.md) | text | T&C cluster (lines 127–144) |
| [rikvin-disclaimer](incorp/regions/sg/rikvin-disclaimer.md) | text | After EP table (line 97) |

Other regions and Harneys blocks: Phase 2 — promote from [examples](/examples/index.md).
