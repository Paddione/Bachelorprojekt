## ADDED Requirements

### Requirement: Test Data Isolation in Billing

The system SHALL identify all billing entities (`billing_customers`, `billing_invoices`, `billing_invoice_line_items`) created during system tests with an `is_test_data = true` flag.

#### Scenario: E2E test creates an invoice
- **GIVEN** a request with the `X-E2E-Test` header
- **WHEN** the system creates a billing customer or invoice
- **THEN** the corresponding database rows SHALL have `is_test_data = true`

### Requirement: GoBD Exemption for Test Data

The system SHALL enforce GoBD immutability and non-deletion rules (via database triggers) strictly for production data (`is_test_data = false`), but SHALL exempt test data (`is_test_data = true`) to allow automated test cleanup.

#### Scenario: Attempting to delete a locked invoice
- **GIVEN** a locked invoice
- **WHEN** a deletion is attempted
- **THEN** the system SHALL reject the deletion if `is_test_data = false`
- **AND** the system SHALL allow the deletion if `is_test_data = true`

### Requirement: Test Data Purge of Billing Entities

The database cleanup function (`fn_purge_test_data()`) SHALL cleanly remove all billing entities marked with `is_test_data = true` without violating foreign key constraints or being blocked by the GoBD triggers.

#### Scenario: Purge function executes
- **GIVEN** test invoices and test customers with `is_test_data = true`
- **WHEN** `fn_purge_test_data()` is called
- **THEN** all test invoice line items, test invoices, and test billing customers SHALL be deleted
- **AND** the invoice counters SHALL NOT be affected by the deletion of test data (Wait, if we delete test invoices, the counter remains where it was. It does not auto-decrement. But we'll leave that aside. We just need it deleted).
