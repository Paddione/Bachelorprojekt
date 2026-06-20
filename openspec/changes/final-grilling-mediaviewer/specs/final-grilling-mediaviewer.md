## ADDED Requirements

### Requirement: final-grilling-v1 questionnaire

The system SHALL register a questionnaire with id `final-grilling-v1` containing 6
sections and 23 questions in the `QUESTIONNAIRES` registry so that the grilling stepper
can load it by id.

#### Scenario: Questionnaire lookup by id

- **GIVEN** the questionnaire registry is loaded
- **WHEN** `QUESTIONNAIRES['final-grilling-v1']` is accessed
- **THEN** the result has exactly 6 sections
- **AND** the total question count across all sections is 23

### Requirement: postMessage bridge types for grilling mode

The system SHALL define new postMessage types `setMode`, `setGrillingData`, `grillingAnswer`,
`grillingDismiss`, and `grillingComplete` in `mediaviewer-bridge.ts` (host) and
`embed/bridge.ts` (widget) so both sides can exchange grilling state.

#### Scenario: Host sends setMode to widget

- **GIVEN** MediaviewerPanel has the widget iframe loaded
- **WHEN** `setMode('grilling')` is called on the panel
- **THEN** a `{ type: 'setMode', mode: 'grilling' }` postMessage is sent to the iframe origin

#### Scenario: Widget emits grillingAnswer to host

- **GIVEN** the widget is in grilling mode and the user fills an answer
- **WHEN** the widget sends a `grillingAnswer` message with `{ questionId, answer }`
- **THEN** the host's outbound handler receives it and triggers a PATCH to the ticket API

### Requirement: Widget grilling mode routing

The system SHALL conditionally render `GrillingSessionView` inside the widget's `EmbedApp`
when `mode === 'grilling'` and the existing video view when `mode === 'video'`, with no
flash between modes.

#### Scenario: Widget starts in grilling mode

- **GIVEN** the host posts `setMode('grilling')` before the widget user interaction
- **WHEN** `EmbedApp` renders
- **THEN** `GrillingSessionView` is shown, not the video player

#### Scenario: Widget falls back to video mode

- **GIVEN** no `setMode` message has been received
- **WHEN** `EmbedApp` renders
- **THEN** the default video view is shown

### Requirement: GrillingSessionView React component

The system SHALL provide a `GrillingSessionView` React component inside the widget that
renders a question stepper with answer fields and suggestion cards, emitting
`grillingAnswer` messages on text input and `grillingComplete` on final submission.

#### Scenario: Suggestion card fills answer field

- **GIVEN** a question has AI-generated suggestions in its `grillingData`
- **WHEN** the user clicks a suggestion card
- **THEN** the answer textarea is populated with the suggestion text
- **AND** a `grillingAnswer` postMessage is queued

#### Scenario: grillingComplete fires on last question submission

- **GIVEN** the user is on the last question and has entered an answer
- **WHEN** the user submits
- **THEN** a `grillingComplete` postMessage is sent to the host
- **AND** the view shows a completion state

### Requirement: MediaviewerPanel mode-capable

The system SHALL extend `MediaviewerPanel.svelte` with a `mode` prop that controls which
postMessages are sent to the widget on load, and with outbound handlers that map
`grillingAnswer`/`grillingDismiss`/`grillingComplete` widget messages to ticket PATCH calls.

#### Scenario: Panel sends setGrillingData on grilling mode load

- **GIVEN** `<MediaviewerPanel mode="grilling" ticketId="..." />` is mounted
- **WHEN** the widget iframe fires its ready event
- **THEN** the panel posts `setMode('grilling')` followed by `setGrillingData({...})` to the widget

### Requirement: GrillingSessionHost with implicit enrichment

The system SHALL provide a `GrillingSessionHost.svelte` that loads the ticket context and
calls `buildGrillingSessionData()` from `final-grilling.ts` to derive contextual hints and
AI suggestions, persists answers via PATCH, and fails softly (no suggestions = no cards;
PATCH error = no abort).

#### Scenario: Missing suggestions do not crash the host

- **GIVEN** `buildGrillingSessionData()` returns an empty suggestions array for a ticket
- **WHEN** GrillingSessionHost renders
- **THEN** the grilling session starts without suggestion cards
- **AND** no error is thrown

#### Scenario: PATCH error is non-fatal

- **GIVEN** the PATCH API returns a 500 for an answer save
- **WHEN** the host handles the `grillingAnswer` message
- **THEN** no visible crash or modal error appears
- **AND** subsequent questions can still be answered

### Requirement: SidekickHome grilling tile and PortalSidekick routing

The system SHALL add a "Final Grilling" tile to `SidekickHome` (visible only in admin
context with an active ticket) and route the grilling view to `GrillingSessionHost` in
`PortalSidekick`, staying within the 89-line budget for PortalSidekick.

#### Scenario: Grilling tile only visible with ticket context

- **GIVEN** the sidekick home screen is shown in an admin context with no active ticket
- **WHEN** the tile list is rendered
- **THEN** no "Final Grilling" tile is shown

#### Scenario: Grilling tile visible with ticket

- **GIVEN** the sidekick home screen is shown in an admin context with `ticketId` set
- **WHEN** the tile list is rendered
- **THEN** a "Final Grilling" tile is present
- **AND** clicking it transitions the sidekick to the grilling session view
