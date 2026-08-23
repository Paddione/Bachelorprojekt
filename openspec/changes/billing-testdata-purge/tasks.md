---
title: "billing-testdata-purge — Implementation Plan"
ticket_id: T015362
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# billing-testdata-purge — Implementation Plan

_Ticket: T015362_

## File Structure

- `components/website/src/lib/billing-db.ts`
- `components/website/src/lib/stripe-billing.ts`
- `components/website/src/lib/native-billing.ts`
- `components/website/src/pages/api/billing/invoice/[id]/pdf.ts`
- `scripts/one-shot/purge-fn-v8.sql`
- `scripts/one-shot/purge-billing-testdata.sql`
- `tests/spec/billing-pipeline.bats`

## Tasks

### p1-schema.md
Add `is_test_data` to billing tables and exempt test data from GoBD triggers.
- In `components/website/src/lib/billing-db.ts`, update `initBillingTables` to:
  - Add `is_test_data BOOLEAN NOT NULL DEFAULT FALSE` to `billing_customers`, `billing_invoices`, and `billing_invoice_line_items`.
- In `components/website/src/lib/billing-db.ts`, update the `billing_invoices_no_delete()` and `billing_lines_immutable()` trigger functions to check `IF OLD.locked = true AND OLD.is_test_data = false THEN`. Test data must be exempt from the GoBD locks to allow cleanup.

### p2-app-logic.md
Ensure new test data sets `is_test_data = true`.
- In `components/website/src/lib/native-billing.ts` and `components/website/src/lib/stripe-billing.ts` (wherever billing customers and invoices are created), use `isE2ETestRequest(request)` to determine test context and set `is_test_data = true` during `INSERT`.
- If those functions don't receive `request`, pass the boolean down from the API endpoints (e.g. `/api/billing/...` or wherever invoices are created). Wait, `isE2ETestRequest` is in `src/lib/e2e-marker.ts`.

### p3-purge.md
Update the purge mechanism.
- In `scripts/one-shot/purge-fn-v8.sql`, remove the `has_billing_inv` protection for test customers (or change it to `WHERE bi.customer_id = c.id::text AND bi.is_test_data = false`) and add DELETE statements to purge test lines, test invoices, and test billing customers directly.
- Create `scripts/one-shot/purge-billing-testdata.sql` to manually clean up the existing 427 locked test invoices and 1632 test customers, and carefully reset `invoice_counters` if appropriate.

### p4-tests.md
Verify that the `is_test_data` logic.
<!-- vitest: kein neuer Test nötig, weil die reinen DB-Aenderungen durch BATS abgedeckt werden --> and exemptions work.
- In `tests/spec/billing-pipeline.bats`:
  - Run the `grep` assertions to ensure `is_test_data` is used in the codebase (`expected: FAIL`):
  ```bash
  npx bats tests/spec/billing-pipeline.bats
  ```

## Verify
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
