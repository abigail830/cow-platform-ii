# Computations

[Attested Computation](/meta/type-vocabulary.md) concepts for fee totals, tax, and derived proposal sections.

## Catalog

| Computation | Purpose | Validated anchor |
|-------------|---------|------------------|
| [first-invoice-from-fee-tables](first-invoice-from-fee-tables.md) | Optional estimated first invoice — one-off or first recurring period + per-line tax | [incorp-sg-cs-tax-payroll-accounting-ff](/examples/incorp-sg-cs-tax-payroll-accounting-ff.md) tbl[6] |
| [fee-table-total-column](fee-table-total-column.md) | Optional per-row **Total** on multi-frequency fee tables — annualized frequency rollup | [incorp-ph-cs-payroll-bookkeeping-ep](/examples/incorp-ph-cs-payroll-bookkeeping-ep.md) tbl[4–7] |

## Shared optional sections

Templates wire `first_invoice` (`derived_section`, `default_enabled: false`) to:

* Block: [estimated-first-invoice-value](/blocks/incorp/shared/estimated-first-invoice-value.md)
* Computation: [first-invoice-from-fee-tables](first-invoice-from-fee-tables.md)

Region-specific GST/VAT rate lives on the template `derivation.tax` block, not in the computation file.

## Fee table Total column

Enable on any template using [multi-frequency](/layouts/multi-frequency.md):

```yaml
fee_layout:
  show_total_column: true
  total_column:
    computation: computations/fee-table-total-column.md
```

Formula: `once_off + monthly×12 + quarterly×4 + annual` (see computation for parsing rules).
