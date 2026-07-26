<!-- openspec-delta: spec-bats-billing-business -->
## Changes

### Requirement: FA-21 PR-A — Invoice Lifecycle (Partial/Full Payment)

#### Scenario: Payment recording error handling

GIVEN a finalized invoice in the admin panel
WHEN the RecordPaymentModal sendet einen API-Request und der Server antwortet nicht
THEN der "Speichern"-Button wird wieder aktiviert
AND eine Fehlermeldung "Netzwerkfehler — Zahlung konnte nicht gespeichert werden." wird angezeigt

#### Scenario: Payment recording API validation

GIVEN a finalized invoice in the admin panel
WHEN the user sends a POST to /api/admin/billing/{id}/payments with valid data
THEN the API responds with 201 Created
AND the payment is persisted in the database
