# Delta Spec: Steuerung und Audit im SDLC-Cockpit (K4)

> Parent SSOT: `sdlc-cockpit`
> Änderungstyp: ADDED (löst die Zusagen aus `cockpit-auth-schnitt` für Klasse A ein)

## ADDED Requirements

### Requirement: Setting a ticket status is the one implemented write action

The system SHALL implement exactly one cluster-side write action in this change:
setting a ticket's status through the website's admin API. Merging a pull
request SHALL NOT be implemented here.

The reason is a token boundary, not an omission: the website pod mounts only
`GITHUB_CONTENT_TOKEN`, whose scope is limited to `website/content/**`. The
broader `GITHUB_PAT` is not set in the deployment, so a merge endpoint would be
dead at runtime.

The confirmation grading, the audit log and the four-state action slot SHALL
nevertheless be built in full, so that a later write action attaches to them as
a second consumer rather than reintroducing them.

#### Scenario: The ticket status endpoint requires an admin session

- **GIVEN** a request to set a ticket status
- **WHEN** it carries no valid admin session
- **THEN** the endpoint responds `403`
- **AND** no status is written

#### Scenario: A status change is written and reported

- **GIVEN** an authenticated admin request naming a ticket and a valid status
- **WHEN** the endpoint processes it
- **THEN** the ticket carries the new status
- **AND** the response names both the previous and the new status

#### Scenario: An unknown status is rejected

- **GIVEN** an authenticated admin request naming a status outside the
  ticket status vocabulary
- **WHEN** the endpoint processes it
- **THEN** it responds `400`
- **AND** no status is written

### Requirement: The audit log lives in the ticket database and is bound to the action

The system SHALL record every performed cockpit write action in the ticket
database, with timestamp, actor, action, target and outcome. The actor SHALL be
derived from the session, never from the request body.

The audit row and the business change SHALL be written in one transaction. A
lost audit row is not tolerable here: the promise is that every performed write
action appears in the log, so a failed audit write SHALL fail the action rather
than pass silently.

#### Scenario: A performed action leaves an audit row

- **GIVEN** an authenticated admin sets a ticket status
- **WHEN** the change succeeds
- **THEN** the audit log holds a row with timestamp, actor, action and target

#### Scenario: A failed audit write fails the action

- **GIVEN** an authenticated admin sets a ticket status
- **WHEN** the audit row cannot be written
- **THEN** the status change is not committed
- **AND** the response reports the failure

#### Scenario: Reading the audit log requires an admin session

- **GIVEN** a request for the audit log
- **WHEN** it carries no valid admin session
- **THEN** the endpoint responds `403`

### Requirement: The action slot carries four distinguishable states

The system SHALL express the action slot in the four states `available`,
`locked`, `confirming` and `running`. A locked action SHALL be shown as visibly
and recognisably locked, not hidden — otherwise a missing action cannot be told
apart from an action that is merely not unlocked.

The `running` state SHALL end on the actual outcome of the action, not after a
fixed delay. A slow action SHALL NOT be shown as available while it is still
running.

#### Scenario: A locked action stays visible

- **GIVEN** an action the current context does not permit
- **WHEN** the panel renders its action slot
- **THEN** the action remains visible and is marked as locked

#### Scenario: The running state ends with the result

- **GIVEN** an action that takes longer than a fixed timeout would allow
- **WHEN** it is still running
- **THEN** the slot still shows `running`
- **AND** it changes only once the action has resolved or failed

### Requirement: Confirmation is graded by reversibility

The system SHALL grade the confirmation by the reversibility of the action:
repeatable actions SHALL ask nothing, reversible actions SHALL ask a simple
confirmation, and non-reversible actions SHALL ask a confirmation that names the
concrete target. An action of unknown classification SHALL be treated as
non-reversible.

The classification SHALL live in a component that can be exercised without a
browser document, so that it is measurable rather than merely asserted.

#### Scenario: A repeatable action asks nothing

- **GIVEN** a repeatable action such as a refresh
- **WHEN** the user triggers it
- **THEN** it runs without a confirmation

#### Scenario: A non-reversible action names its target

- **GIVEN** a non-reversible action and a concrete target
- **WHEN** the user triggers it
- **THEN** the confirmation names that target

#### Scenario: A non-reversible action without a target is refused

- **GIVEN** a non-reversible action for which no target is supplied
- **WHEN** a confirmation is requested for it
- **THEN** the request fails rather than producing an unnamed confirmation

### Requirement: Non-reversible actions are unlocked per session on small screens

The system SHALL lock non-reversible actions by default in the mobile and
fullscreen presentation, and SHALL require a deliberate unlock that lasts for
the session. The lock SHALL apply when the page is already loaded at that size,
not only when the presentation is switched.

#### Scenario: A page loaded at mobile size is locked

- **GIVEN** the cockpit is loaded at mobile size
- **WHEN** a panel with a non-reversible action renders
- **THEN** that action is locked

#### Scenario: A deliberate unlock lasts for the session

- **GIVEN** the user has deliberately unlocked non-reversible actions
- **WHEN** the page is reloaded within the same session
- **THEN** the actions remain unlocked
- **AND** a new session starts locked again

### Requirement: The browser holds no daemon write token

The system SHALL NOT keep a browser-side path to the daemon's write endpoints
while no authentication is designed for it. The token retrieval and the agent
write call SHALL be removed rather than kept as unreachable code, because code
that fails by construction cannot be told apart from code that is broken.

The daemon's own write endpoints SHALL remain in place and SHALL remain
token-guarded; only the browser-side access is removed.

#### Scenario: The adapter exposes no token retrieval

- **GIVEN** the cockpit adapter is loaded
- **WHEN** its public interface is inspected at runtime
- **THEN** it offers the ticket write action
- **AND** it offers neither a token retrieval nor an agent write action

#### Scenario: The ticket write action uses the session

- **GIVEN** the cockpit is served from the admin area
- **WHEN** the adapter performs the ticket write action
- **THEN** it addresses the website's admin API with the session credentials
- **AND** it sends no bearer token
