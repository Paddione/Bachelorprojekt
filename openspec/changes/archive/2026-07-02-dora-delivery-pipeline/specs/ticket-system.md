## MODIFIED Requirements

### Requirement: Status-Lifecycle-Enforcement

The system SHALL only permit transitions to the 11 defined statuses (`triage`, `planning`, `plan_staged`, `backlog`, `in_progress`, `in_review`, `qa_review`, `blocked`, `awaiting_deploy`, `done`, `archived`) and SHALL reject any transition to an unknown status. The `awaiting_deploy` and `qa_review` statuses SHALL remain valid enum values but SHALL NO LONGER be written on the automated happy path: a confirmed green auto-merge to `main` SHALL transition the ticket directly to `done` with `resolution = 'shipped'`. The two retired statuses persist only for historical rows, manual special cases, and the watchdog safety net (no destructive enum/constraint migration).

#### Scenario: Ungültiger Status wird abgelehnt

- **GIVEN** ein Ticket befindet sich in Status `in_progress`
- **WHEN** `transitionTicket` mit `status = 'closed'` aufgerufen wird
- **THEN** wird ein Fehler geworfen und die Datenbank bleibt unverändert

#### Scenario: Terminaler Status erfordert Resolution

- **GIVEN** ein Ticket soll auf `done` oder `archived` gesetzt werden
- **WHEN** `transitionTicket` ohne `resolution`-Parameter aufgerufen wird
- **THEN** wird ein Fehler geworfen (`status=done requires a resolution`)

#### Scenario: Merge closes directly to done/shipped

- **GIVEN** a feature/task ticket is `in_progress` and its PR auto-merges green to `main`
- **WHEN** the closing step runs (Factory pipeline or dev-flow-execute)
- **THEN** the ticket transitions directly to `done` with `resolution = 'shipped'`, and no intermediate `awaiting_deploy` or `qa_review` transition is written

#### Scenario: Retired statuses still accepted for manual use

- **GIVEN** an operator manually sets a ticket to `awaiting_deploy`
- **WHEN** the transition is validated
- **THEN** the validation passes (the enum value remains valid); the watchdog continues to escalate `awaiting_deploy > 24h` as a safety net
