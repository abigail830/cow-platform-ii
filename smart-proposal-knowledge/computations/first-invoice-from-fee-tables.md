---
type: Attested Computation
title: First invoice from fee tables (one-off / recurring)
description: >-
  Roll up solution_and_fees rows into an estimated first-invoice table: per-line
  price from one-off or first recurring period, tax per line, grand total.
  Validated against incorp-sg-cs-tax-payroll-accounting-ff tbl[6].
tags: [finance, fees, first-invoice, incorp, gst, optional]
status: draft
runtime: python
parameters:
  - { name: fee_rows, type: array, required: true }
  - { name: tax_rate, type: number, required: true }
  - { name: tax_label, type: string, required: false }
  - { name: currency, type: string, required: false }
  - { name: exclude_adhoc_pattern, type: string, required: false }
generated:
  by: human:qianping
  at: 2026-07-26T23:25:00Z
sources:
  - id: anchor-example
    resource: examples/incorp-sg-cs-tax-payroll-accounting-ff.md
    title: Reference Proposal — SG Tax + first invoice (tbl[6])
  - id: anchor-extraction
    resource: references/extractions/incorp-sg-cs-tax-payroll-accounting-ff/spine.md
    title: Layer 1 spine — fee tbl[4–5], invoice tbl[6]
  - id: layout
    resource: layouts/oneoff-recurring.md
    title: Quotation layout oneoff-recurring
---

# Definition

Materializes the optional **Estimated first invoice value** section ([shared block](/blocks/incorp/shared/estimated-first-invoice-value.md)) from `solution_and_fees` fee rows.

**Not** annualised recurring totals. **Not** ad-hoc rows (when `exclude_adhoc_pattern` matches).

# Inputs

| Parameter | Source (typical) | Notes |
|-----------|------------------|-------|
| `fee_rows` | `solution_and_fees` materialized rows | One row per selected SKU line |
| `tax_rate` | Template `derivation.tax.rate` | e.g. `0.09` SG GST |
| `tax_label` | Template `derivation.tax.label` | e.g. `GST` |
| `currency` | Template `fee_layout.currency` | e.g. `SGD` |
| `exclude_adhoc_pattern` | Template `derivation.exclude.pattern` | Default below |

Each `fee_row` exposes (from [oneoff-recurring](/layouts/oneoff-recurring.md) shape):

- `title` / `service_name` — line label in output
- `fees.one_off.amount` or `fees.one_off.display`
- `fees.recurring.amount` or `fees.recurring.display` (+ optional `period`)

# Algorithm

For each `fee_row` in `fee_rows`:

1. **Skip** if `exclude_adhoc_pattern` matches any of `service_name`, `description`, `scope_of_work`, `scope_of_work_display`, `preview_primary` (case-insensitive).
2. **Line price** (`price`):
   - If `fees.one_off` has a parseable numeric amount → use it.
   - Else if `fees.recurring` has a parseable numeric amount → use **first billing period only** (the number before frequency words such as Monthly, Quarterly, Annual). **Do not** multiply by 12 for monthly rows.
   - Else → skip row (both columns empty or `-`).
3. **Per-line tax**: `gst = round(price * tax_rate, 2)` (round half-up per currency minor unit).
4. **Per-line total**: `total = price + gst`.
5. Emit output row: `{ service: title, price, gst, total }`.

**Footer rollup** (separate total row):

- `subtotal_price = sum(price)`
- `subtotal_gst = sum(gst)`
- `grand_total = sum(total)`

Anchor check (SG sample, 26 lines): `subtotal_price = 19,380`, `subtotal_gst = 1,744.20`, `grand_total = 21,124.20` at `tax_rate = 0.09`.

# Output table shape

| Column | Header (SG anchor) | Content |
|--------|-------------------|---------|
| `service` | Services | Fee row title |
| `price` | Price (SGD) | Line price before tax |
| `gst` | GST (SGD) (9%) | Per-line tax |
| `total` | Total (SGD) | Price + GST |
| *(footer)* | Total | Column sums |

Region templates may override column headers via `derivation.tax.label` / `currency`; computation values stay numeric.

# Layout compatibility

| Layout | Supported |
|--------|-----------|
| [oneoff-recurring](/layouts/oneoff-recurring.md) | **Yes** — anchor validated |
| [multi-frequency](/layouts/multi-frequency.md) | Partial — map first selected frequency column to `first_period_amount` (no anchor yet) |
| `custom` | Agent maps columns explicitly before calling |

# Computation

```python
import re
from decimal import Decimal, ROUND_HALF_UP

DEFAULT_EXCLUDE = r"(?i)(?<![a-z-])ad[\s-]?hoc(?![a-z])"

def parse_amount(cell) -> Decimal | None:
    if cell is None:
        return None
    if isinstance(cell, dict):
        if cell.get("amount") is not None:
            return Decimal(str(cell["amount"]))
        cell = cell.get("display", "")
    s = str(cell).strip()
    if not s or s == "-":
        return None
    m = re.search(r"([\d,]+(?:\.\d+)?)", s)
    return Decimal(m.group(1).replace(",", "")) if m else None

def line_price(row) -> Decimal | None:
    fees = row.get("fees") or {}
    one_off = parse_amount(fees.get("one_off"))
    if one_off is not None:
        return one_off
    return parse_amount(fees.get("recurring"))

def first_invoice_lines(
    fee_rows,
    tax_rate: float,
    exclude_adhoc_pattern: str = DEFAULT_EXCLUDE,
):
    pat = re.compile(exclude_adhoc_pattern)
    fields = ("service_name", "description", "scope_of_work", "scope_of_work_display", "preview_primary")
    lines = []
    for row in fee_rows:
        if any(pat.search(str(row.get(f) or "")) for f in fields):
            continue
        price = line_price(row)
        if price is None:
            continue
        gst = (price * Decimal(str(tax_rate))).quantize(Decimal("0.01"), ROUND_HALF_UP)
        total = price + gst
        lines.append({
            "service": row.get("title") or row.get("service_name"),
            "price": price,
            "gst": gst,
            "total": total,
        })
    subtotal_price = sum((l["price"] for l in lines), Decimal(0))
    subtotal_gst = sum((l["gst"] for l in lines), Decimal(0))
    grand_total = sum((l["total"] for l in lines), Decimal(0))
    return {
        "lines": lines,
        "subtotal_price": subtotal_price,
        "subtotal_gst": subtotal_gst,
        "grand_total": grand_total,
    }
```

# Consumers

* [sg-incorp](/templates/sg-incorp.md) — `first_invoice` derived section (anchor validated)
* [ph-incorp](/templates/ph-incorp.md), [au-advisory](/templates/au-advisory.md), [hk-incorp](/templates/hk-incorp.md) — optional; set `derivation.tax` per region
