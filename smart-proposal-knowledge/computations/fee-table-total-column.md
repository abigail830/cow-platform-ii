---
type: Attested Computation
title: Fee table Total column (multi-frequency)
description: >-
  Per-row annualized rollup for optional Total column on multi-frequency fee tables:
  once-off + monthly×12 + quarterly×4 + annual. Validated against incorp-ph-cs-payroll-bookkeeping-ep tbl[4–7].
tags: [finance, fees, total-column, multi-frequency, incorp, shared]
status: draft
runtime: python
parameters:
  - { name: fee_row, type: object, required: true }
  - { name: frequency_keys, type: array, required: false }
generated:
  by: human:qianping
  at: 2026-07-26T23:45:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-ph-cs-payroll-bookkeeping-ep.md
    title: Reference Proposal — PH multi-service (tbl[4–7] Total column)
  - id: anchor-extraction
    resource: references/extractions/incorp-ph-cs-payroll-bookkeeping-ep/spine.md
    title: Layer 1 spine — fee modules with Total
  - id: layout
    resource: layouts/multi-frequency.md
    title: Quotation layout multi-frequency
---

# Definition

Materializes the optional **Total** column on [multi-frequency](/layouts/multi-frequency.md) fee tables. Any region/template that enables `show_total_column` uses this computation — not region-specific logic in the layout file.

**Annualized** rollup (year-equivalent), not first-invoice amount. For first-invoice rollup see [first-invoice-from-fee-tables](/computations/first-invoice-from-fee-tables.md).

# Inputs

| Field | `fees` key (layout) | Anchor column header |
|-------|---------------------|----------------------|
| Once-off | `once_off` | One-off |
| Monthly | `monthly` | Monthly |
| Quarterly | `quarterly` | Quarterly |
| Annual | `annual` | Annually |

Default `frequency_keys`: `["once_off", "monthly", "quarterly", "annual"]`.

# Algorithm

For each `fee_row`:

1. **Parse** each frequency cell to a decimal amount, or skip that component:
   - Empty, `-`, `Custom`, or text with no leading number → component = 0 (non-contributing).
   - **Once-off with `/`** (e.g. `92,530/308,500`) → use **first segment only** before `/`.
   - Otherwise → **first numeric token** in the string (e.g. `85,000 and Government fee 20,000.00` → `85000`; government fee suffix excluded).
2. **Row total**:
   ```
   total = once_off + (monthly × 12) + (quarterly × 4) + annual
   ```
3. If all four components are non-parseable → `total = null` (leave cell empty; anchor: Custom bookkeeping row, descriptive-only annualization row).
4. Round to currency minor units (2 dp for PHP/AUD; template may override).

# Anchor validation (PH tbl[4–6])

| Pattern | Example | Total |
|---------|---------|-------|
| One-off only | Business registration one-off | = one-off |
| Monthly × 12 | CS PHP 15,000/mo | 180,000 |
| Annual only | Virtual office PHP 5,500/yr | 5,500 |
| One-off slash | OPE `92,530/308,500` | 92,530 |
| Mixed none | Bookkeeping `Custom` monthly | *(empty)* |

tbl[7] (one-off + Total only): `total = parse_once_off(one_off)` — same once-off parser, other frequencies zero.

# Output

Write computed value to `fees.total` (display + amount). Do not store in Section Block bodies.

# Layout compatibility

| Layout | Total column |
|--------|--------------|
| [multi-frequency](/layouts/multi-frequency.md) | **Yes** — anchor validated |
| [oneoff-recurring](/layouts/oneoff-recurring.md) | No Total column (use first-invoice computation instead) |
| `custom` | Opt-in via template `fee_layout.show_total_column` |

# Computation

```python
import re
from decimal import Decimal, ROUND_HALF_UP

NON_AMOUNT = re.compile(r"(?i)^(?:custom|-+|n/a)$")

def parse_amount(cell) -> Decimal | None:
    if cell is None:
        return None
    if isinstance(cell, dict):
        if cell.get("amount") is not None:
            return Decimal(str(cell["amount"]))
        cell = cell.get("display", "")
    s = str(cell).strip()
    if not s or NON_AMOUNT.search(s):
        return None
    m = re.search(r"([\d,]+(?:\.\d+)?)", s)
    return Decimal(m.group(1).replace(",", "")) if m else None

def parse_once_off(cell) -> Decimal | None:
    if cell is None:
        return None
    if isinstance(cell, dict):
        cell = cell.get("display") or cell.get("amount")
    s = str(cell).strip()
    if "/" in s:
        s = s.split("/")[0]
    return parse_amount(s)

def fee_row_total(
    fee_row,
    frequency_keys=("once_off", "monthly", "quarterly", "annual"),
    multipliers=None,
):
    multipliers = multipliers or {
        "once_off": 1,
        "monthly": 12,
        "quarterly": 4,
        "annual": 1,
    }
    fees = fee_row.get("fees") or {}
    parts = []
    for key in frequency_keys:
        raw = fees.get(key)
        if key == "once_off":
            amt = parse_once_off(raw)
        else:
            amt = parse_amount(raw if not isinstance(raw, dict) else raw.get("display") or raw.get("amount"))
        if amt is not None:
            parts.append(amt * Decimal(str(multipliers[key])))
    if not parts:
        return None
    return sum(parts, Decimal(0)).quantize(Decimal("0.01"), ROUND_HALF_UP)
```

# Consumers

* [ph-incorp](/templates/ph-incorp.md) — `solution_and_fees.fee_layout.show_total_column`
* [au-advisory](/templates/au-advisory.md) — optional when Total column enabled on multi-frequency tables
