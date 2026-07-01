## ADDED Requirements

### Requirement: seedInvoiceCounter Seeds a Row Matching the Table's Primary Key

`seedInvoiceCounter(brand, year, value)` SHALL insert or no-op against the
`invoice_counters` table's actual primary key `(brand, year, kind)`, using
`kind`'s column default (`'invoice'`) when not given explicitly, without
throwing a constraint-mismatch error.

#### Scenario: Seeding a new brand/year pair succeeds

- **GIVEN** no `invoice_counters` row exists for `(brand='korczewski', year=<current-year>, kind='invoice')`
- **WHEN** `seedInvoiceCounter('korczewski', <current-year>, 41)` is called
- **THEN** it resolves without throwing, and a subsequent `getNextInvoiceNumber('korczewski', 'invoice')` returns `RE-<current-year>-0042`
