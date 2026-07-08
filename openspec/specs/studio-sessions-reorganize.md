# studio-sessions-reorganize

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu studio-sessions-reorganize ergänzen._

## Requirements

### Requirement: Unified Sessions navigation entry

The admin sidebar SHALL expose exactly one coaching navigation entry labeled "Sessions" that links to `/admin/coaching/studio` and highlights for both `/admin/coaching/studio` and `/admin/fragebogen`. There SHALL be no separate sidebar entry for `/admin/coaching/sessions`.

#### Scenario: Sidebar shows single Sessions entry

- **GIVEN** an admin views any admin page
- **WHEN** the sidebar renders
- **THEN** it contains one item labeled "Sessions" with href `/admin/coaching/studio`
- **AND** no sidebar item links to `/admin/coaching/sessions`

### Requirement: Sessions list reachable via tab bar

The list-based sessions view at `/admin/coaching/sessions` SHALL remain reachable through the tab bar on the sessions pages: a "Sessions-Liste" tab links to `/admin/coaching/sessions` and a "Sessions" tab links to `/admin/coaching/studio`. The former "Projekte" tab SHALL NOT be present.

#### Scenario: Tab bar navigation

- **GIVEN** an admin opens `/admin/coaching/sessions`
- **WHEN** the tab bar renders
- **THEN** it offers tabs linking to `/admin/coaching/sessions` and `/admin/coaching/studio`
- **AND** it contains no link to `/admin/coaching/projekte`

### Requirement: Studio page titled Coaching Sessions

The studio Astro wrapper SHALL use the page title "Coaching Sessions", and the studio React application SHALL show the sub-brand "Coaching Sessions" with a "Sessions-Liste" navigation button linking to `/admin/coaching/sessions`.

#### Scenario: Studio page titles

- **GIVEN** an admin opens `/admin/coaching/studio`
- **WHEN** the page renders
- **THEN** the layout title is "Coaching Sessions" and the app header shows "Coaching Sessions"

### Requirement: No redundant new-session action in list view

The sessions list overview SHALL NOT render a "+ Neue Session" action; new sessions are initiated from the studio context.

#### Scenario: List view has no create button

- **GIVEN** an admin opens the sessions list overview
- **WHEN** the component renders
- **THEN** no "+ Neue Session" link or button is present

<!-- merged from change delta studio-sessions-reorganize.md (ade0fbf828b9) -->