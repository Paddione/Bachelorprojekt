## ADDED Requirements

### Requirement: Prod-Guard gegen E2E-Testdaten in Postfach
Die API-Endpunkte `/api/contact`, `/api/booking`, `/api/bug-report` und `/api/portal/messages` MÜSSEN den `X-E2E-Test`-Header in Production-Umgebungen (`NODE_ENV=production`) ignorieren. `is_test_data` MUSS in Production immer `false` sein.

#### Scenario: X-E2E-Test Header wird in Prod ignoriert
- **WHEN** a request with `X-E2E-Test: true` header arrives in production
- **THEN** the request is processed normally but `is_test_data` is set to `false`

#### Scenario: X-E2E-Test Header funktioniert in Dev/Test
- **WHEN** a request with valid `X-E2E-Test` and `X-Cron-Secret` headers arrives in non-production
- **THEN** `is_test_data` is set to `true` as before
