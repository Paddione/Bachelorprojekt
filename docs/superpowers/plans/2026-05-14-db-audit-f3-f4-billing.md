---
ticket_id: T000375
---

# Plan: DB Audit Phase 3 & 4 (Billing Schema Cleanup)

Normalization issues #2, #3, #4, and #7 from `docs/db-schema-diagram.md`.

## Proposed Changes

### F3: Billing Schema Cleanup

#### 1. Extract blobs to `billing_invoice_documents` (#4)
- **New Table:** `billing_invoice_documents`
  - `invoice_id` (TEXT, PK, FK -> `billing_invoices.id`)
  - `format` (TEXT, PK) - e.g., 'pdf', 'pdf_a3', 'zugferd', 'factur_x', 'xrechnung'
  - `content` (BYTEA)
- **Migration:**
  - Copy data from `pdf_blob`, `pdf_a3_blob`, `zugferd_xml`, `factur_x_xml`, `xrechnung_xml` into the new table.
- **Cleanup:**
  - Drop the five blob columns from `billing_invoices`.

#### 2. Remove redundant fields (#2, #3)
- **Drop columns** from `billing_invoices`:
  - `paid_at`
  - `paid_amount`
  - `dunning_level`
  - `last_dunning_at`

#### 3. Add View `v_billing_invoices_with_state`
- Calculates `paid_at`, `paid_amount`, `dunning_level`, and `last_dunning_at` dynamically.
- `paid_amount`: `SUM(amount)` from `billing_invoice_payments`.
- `paid_at`: `MAX(paid_at)` from `billing_invoice_payments` (only if fully paid).
- `dunning_level`: `MAX(level)` from `billing_invoice_dunnings`.
- `last_dunning_at`: `MAX(generated_at)` from `billing_invoice_dunnings`.

### F4: Add nullable `billing_customers.customers_id` FK (#7)
- **Modify Table:** `billing_customers`
  - Add `customers_id` (UUID, FK -> `public.customers.id`, NULLABLE).

## Affected Files

### Manifests
- `k3d/website-schema.yaml`: Update table definitions and add the view.

### Code
- `website/src/lib/website-db.ts`: Update `initBillingTables()` to include the new table, view, and migrations.

### Documentation
- `docs/db-schema-diagram.md`: Mark issues #2, #3, #4, #7 as resolved.

## Verification Plan

### Automated Tests
- `task test:all`: Run existing tests to ensure no regressions.
- Add new test cases to verify the new table and view.

### Manual Verification
- Check table structure via `psql`.
- Verify data migration by comparing counts/content before and after column drop.
