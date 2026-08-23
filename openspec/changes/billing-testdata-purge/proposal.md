# Proposal: billing-testdata-purge

## Symptom
System tests generate invoices and customers in the production database that the purge mechanism fails to remove. As of 2026-08-23, there were 1633 test invoices and 1632 test customers, consuming the invoice number sequence and leaving 427 unremovable locked test invoices.

## Ursache
The purge mechanism fails for three independent reasons:
1. **Missing Column:** `billing_customers` and `billing_invoices` lack the `is_test_data` column, which is the standard mechanism to identify test data.
2. **Overprotective Guard:** `fn_purge_test_data()` protects any customer that has invoices via an `AND NOT EXISTS (...)` clause, preventing cleanup of test customers with test invoices.
3. **GoBD Triggers:** The `billing_invoices_no_delete_trg` and `billing_lines_immutable_trg` triggers prevent deletion/modification of locked invoices. They do not distinguish between real data and test data.

## What
1. **Schema Migration:** Add `is_test_data BOOLEAN NOT NULL DEFAULT FALSE` to `billing_customers`, `billing_invoices`, and `billing_invoice_line_items`.
2. **GoBD Exception:** Modify `billing_invoices_no_delete()` and `billing_lines_immutable()` triggers to allow modifications/deletions if `OLD.is_test_data = TRUE`.
3. **App Logic:** Ensure the application sets `is_test_data = TRUE` on billing entities when the context is a system test (e.g. `X-E2E-Test` header).
4. **Purge Updates:** Update `fn_purge_test_data()` to safely delete test invoices, lines, and test customers.
5. **Cleanup:** Provide a one-off SQL script (which we run to clean the 427 remaining invoices and reset `invoice_counters`).

_Ticket: T015362_
