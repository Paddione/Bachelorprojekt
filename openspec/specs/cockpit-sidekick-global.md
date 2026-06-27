# cockpit-sidekick-global


<!-- merged from change delta cockpit-sidekick-global.md on 2026-06-21 -->

## Purpose

### Requirement: CockpitSidekickView component

The system SHALL provide a `CockpitSidekickView` Svelte 5 component that fetches the
portfolio from `/api/admin/cockpit/portfolio`, supports text filtering, an active-only
toggle (persisted in `localStorage`), and collapsed-group state, and navigates to a
feature on `pickFeature(extId)`.

#### Scenario: Portfolio loads on mount

- **GIVEN** the CockpitSidekickView is rendered in the sidekick drawer
- **WHEN** the component mounts
- **THEN** a GET request is made to `/api/admin/cockpit/portfolio`
- **AND** the returned products are displayed according to the current filter state

#### Scenario: cockpit:portfolio-mutated triggers reload

- **GIVEN** CockpitSidekickView is mounted and portfolio data is shown
- **WHEN** a `cockpit:portfolio-mutated` custom event is dispatched on the window
- **THEN** `loadPortfolio()` is called again and the view refreshes

#### Scenario: activeOnly toggle persisted across sessions

- **GIVEN** the user enables the active-only toggle in CockpitSidekickView
- **WHEN** the page is reloaded and the sidekick cockpit view is opened
- **THEN** the active-only toggle is still enabled (read from `localStorage['cockpit:activeOnly']`)

## Requirements

### Requirement: 'cockpit' SidekickView union entry

The system SHALL include `'cockpit'` in the `SidekickView` union type and in `KNOWN_VIEWS`
so that `parseNavigateEvent` and the nudge system can route to the cockpit sidekick view
without falling through to the default case.

#### Scenario: parseNavigateEvent accepts 'cockpit'

- **GIVEN** a postMessage event with `{ type: 'navigate', view: 'cockpit' }`
- **WHEN** `parseNavigateEvent` processes the message
- **THEN** the returned view is `'cockpit'`
- **AND** no "unknown view" warning is emitted

### Requirement: PortalSidekick and SidekickHome cockpit wiring

The system SHALL route the `'cockpit'` view to `CockpitSidekickView` inside
`PortalSidekick`, display "Projekt-Cockpit" as the drawer title for that view, and present
a home tile with `id: 'cockpit'` and subtitle "Container & Features" in `SidekickHome`.

#### Scenario: Cockpit tile visible on SidekickHome

- **GIVEN** the sidekick drawer is open and shows the home screen
- **WHEN** the user sees item 04
- **THEN** it has the label for "Projekt-Cockpit" and subtitle "Container & Features"
- **AND** clicking it transitions the drawer to the `'cockpit'` view

#### Scenario: PortalSidekick renders CockpitSidekickView

- **GIVEN** the sidekick drawer is open with `view === 'cockpit'`
- **WHEN** the drawer body is rendered
- **THEN** a `<CockpitSidekickView />` component is mounted
- **AND** the drawer header reads "Projekt-Cockpit"

### Requirement: Cockpit.svelte decoupled from CockpitSidebar via event bridge

The system SHALL remove the direct `CockpitSidebar` import from `Cockpit.svelte` and
replace it with a window event bridge listening for `cockpit:feature-selected` and
`cockpit:portfolio-mutated`, so that the cockpit layout no longer contains a sidebar column.

#### Scenario: cockpit:feature-selected event triggers feature selection

- **GIVEN** Cockpit.svelte is mounted without a CockpitSidebar
- **WHEN** a `cockpit:feature-selected` event is dispatched on the window with `{ detail: { extId: 'F001' } }`
- **THEN** the feature with extId 'F001' is selected in the cockpit main area
- **AND** the event listener is cleaned up when the component is destroyed
