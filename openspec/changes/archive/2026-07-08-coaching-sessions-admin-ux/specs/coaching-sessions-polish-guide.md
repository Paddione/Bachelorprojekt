## ADDED Requirements

### Requirement: Session-Detailansicht als Popout-Fenster

The coaching session detail view SHALL offer a "Popout" control that opens the
same `SessionWizard` component in a dedicated, chrome-less browser window via a
reusable `openPopout` helper. The popout route MUST enforce the identical
auth guard and data loading as the embedded detail page, and MUST render the
wizard without the admin sidebar or surrounding admin chrome. When the browser
blocks the popup, the control MUST fall back to same-tab navigation.

#### Scenario: Popout opens the wizard in a separate window

- **GIVEN** an authenticated admin on a coaching session detail page
- **WHEN** the admin activates the "Popout" control
- **THEN** a new browser window opens at `/admin/coaching/sessions/<id>/popout`
- **AND** the window renders the `SessionWizard` for that session without the admin sidebar

#### Scenario: Popup blocker falls back to same-tab navigation

- **GIVEN** the browser popup blocker prevents `window.open` from returning a window
- **WHEN** the admin activates the "Popout" control
- **THEN** the helper detects the `null` return value
- **AND** navigates the current tab to the popout URL instead

#### Scenario: Popout route rejects unauthenticated access

- **GIVEN** an unauthenticated visitor
- **WHEN** they request `/admin/coaching/sessions/<id>/popout`
- **THEN** they are redirected to the login URL, matching the embedded detail page guard

### Requirement: Einheitliches "Session"-Wording im Coaching-Kontext

Coaching-facing UI copy SHALL use "Session"/"Sessions" instead of
"Sitzung"/"Sitzungen". This applies strictly to the three coaching strings
(admin dashboard tile, help content for coaching, and the Brett auto-post chat
message). Authentication- and cookie-related "Sitzung" wording (login sessions,
DSGVO cookie copy, Keycloak strings) MUST remain unchanged.

#### Scenario: Coaching copy reads "Session"

- **GIVEN** the admin dashboard tile, the coaching help content, and the Brett auto-post message
- **WHEN** they are rendered
- **THEN** they read "Session"/"Sessions"/"Coaching-Sessions" rather than "Sitzung"/"Sitzungen"

#### Scenario: Auth/cookie wording stays German

- **GIVEN** the login-session and cookie-consent surfaces
- **WHEN** they are rendered
- **THEN** their "Sitzung" wording is preserved unchanged

### Requirement: Coaching-Sessions in der Testdaten-Bereinigung

Coaching sessions SHALL be markable as test data and swept by the idempotent
purge function. `coaching.sessions` MUST carry an `is_test_data boolean NOT NULL
DEFAULT false` column; `createSession` MUST accept an optional `isTestData` flag
(defaulting to `false`) and persist it; seed and E2E code paths that create
coaching sessions MUST set `isTestData: true`. The purge function MUST delete
`coaching.session_steps` and `coaching.sessions` rows flagged as test data,
child steps before parent sessions.

#### Scenario: createSession persists the test-data flag

- **GIVEN** a caller invokes `createSession` with `isTestData: true`
- **WHEN** the row is inserted
- **THEN** `coaching.sessions.is_test_data` is `true` for that session
- **AND** a caller omitting the flag yields `is_test_data = false`

#### Scenario: Purge removes flagged coaching sessions and their steps

- **GIVEN** a coaching session flagged `is_test_data = true` with associated `session_steps`
- **WHEN** `tickets.fn_purge_test_data()` runs
- **THEN** the flagged `coaching.session_steps` are deleted before the flagged `coaching.sessions`
- **AND** sessions with `is_test_data = false` remain untouched
