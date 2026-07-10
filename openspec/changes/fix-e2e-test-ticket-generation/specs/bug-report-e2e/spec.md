## Purpose
Dieser Test definiert das Verhalten der E2E-Tests für das Bug-Report-Formular. Er stellt sicher, dass die Tests nur in Entwicklungs- oder Testumgebungen laufen und nicht in Produktionsumgebungen, um die Erstellung echter Tickets zu verhindern.

## MODIFIED Requirements

### Requirement: E2E Test Skip in Production
The E2E test `fa-26-bug-report-form.spec.ts` SHALL skip execution if the `CRON_SECRET` environment variable is present.

#### Scenario: Test skipped in production
- **WHEN** the `CRON_SECRET` environment variable is set
- **THEN** the `fa-26-bug-report-form.spec.ts` test suite SHALL be skipped

### Requirement: Specific Test Description
The description of the bug report API test SHALL be specific enough to identify the component being tested.

#### Scenario: Test description is specific
- **WHEN** the bug report API test is executed
- **THEN** its description SHALL contain "Bug-Report-Formular"
